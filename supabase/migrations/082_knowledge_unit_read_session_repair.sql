-- K5a repair. 079's v3 read names ten INSERT targets but feeds the candidate
-- table nine expressions: the outer SELECT skips scored.source_session_id, which
-- the scored CTE computes and the response envelope reads back. A plpgsql body is
-- not planned at CREATE time, so 079 applied clean everywhere while the function
-- raised 42601 on its first real call. 079 is already applied and ledgered, so
-- the correction ships forward rather than as an edit: an already-migrated
-- database and a from-zero rebuild converge on this definition. The signature is
-- unchanged, so CREATE OR REPLACE keeps 079's REVOKE/GRANT boundary intact.

BEGIN;

CREATE OR REPLACE FUNCTION public.retrieve_knowledge_graph_claims_v3(
  p_root_authority_id uuid,
  p_viewer_profile_id uuid,
  p_exclude_unit_ids uuid[] DEFAULT '{}',
  p_claim_budget integer DEFAULT 8,
  p_per_claim_partner_cap integer DEFAULT 8,
  p_annotation_check_budget integer DEFAULT 64,
  p_closure_budget integer DEFAULT 16,
  p_max_depth integer DEFAULT 8,
  p_node_budget integer DEFAULT 512,
  p_frontier_budget integer DEFAULT 128
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_root uuid;
  v_frontier uuid[];
  v_next uuid[];
  v_seen uuid[];
  v_depth integer;
  v_candidate_count integer;
  v_truncated boolean := false;
  v_annotation_checks integer := 0;
  v_closure_steps integer := 0;
  v_annotation_count integer;
  v_checks_needed integer;
  v_partner_visible boolean;
  v_stop boolean := false;
  v_claim record;
  v_annotation record;
  v_claims jsonb;
BEGIN
  IF p_root_authority_id IS NULL OR p_viewer_profile_id IS NULL
    OR p_exclude_unit_ids IS NULL
    OR p_claim_budget IS NULL OR p_claim_budget NOT BETWEEN 1 AND 64
    OR p_per_claim_partner_cap IS NULL
      OR p_per_claim_partner_cap NOT BETWEEN 1 AND 16
    OR p_annotation_check_budget IS NULL
      OR p_annotation_check_budget NOT BETWEEN 1 AND 4096
    OR p_closure_budget IS NULL OR p_closure_budget NOT BETWEEN 0 AND 64
    OR p_closure_budget > p_annotation_check_budget
    OR p_max_depth IS NULL OR p_max_depth NOT BETWEEN 0 AND 8
    OR p_node_budget IS NULL OR p_node_budget NOT BETWEEN 1 AND 512
    OR p_frontier_budget IS NULL OR p_frontier_budget NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'knowledge_graph_claim_read_input_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT node.id INTO v_root
  FROM public.graph_nodes node
  WHERE node.kind = 'person'
    AND node.authority_id = p_root_authority_id
    AND public.viewer_has_graph_node_grant(node.id, p_viewer_profile_id);
  IF v_root IS NULL THEN
    RETURN jsonb_build_object('claims', '[]'::jsonb, 'truncated', false);
  END IF;

  v_frontier := ARRAY[v_root];
  v_seen := v_frontier;
  FOR v_depth IN 1..p_max_depth LOOP
    SELECT coalesce(array_agg(node_id ORDER BY node_id), '{}') INTO v_next
    FROM (
      SELECT DISTINCT neighbor.node_id
      FROM unnest(v_frontier) frontier(node_id)
      CROSS JOIN LATERAL public.authorized_graph_neighbors(
        frontier.node_id, p_viewer_profile_id, NULL
      ) neighbor
      WHERE NOT neighbor.node_id = ANY(v_seen)
      ORDER BY neighbor.node_id
      LIMIT p_frontier_budget + 1
    ) bounded;
    IF cardinality(v_next) > p_frontier_budget THEN
      v_truncated := true;
      v_next := v_next[1:p_frontier_budget];
    END IF;
    IF cardinality(v_seen) + cardinality(v_next) > p_node_budget THEN
      v_truncated := true;
      v_next := v_next[1:greatest(p_node_budget - cardinality(v_seen), 0)];
    END IF;
    EXIT WHEN cardinality(v_next) = 0;
    v_seen := v_seen || v_next;
    v_frontier := v_next;
  END LOOP;
  IF EXISTS (
    SELECT 1
    FROM unnest(v_frontier) frontier(node_id)
    CROSS JOIN LATERAL public.authorized_graph_neighbors(
      frontier.node_id, p_viewer_profile_id, NULL
    ) neighbor
    WHERE NOT neighbor.node_id = ANY(v_seen)
  ) THEN
    v_truncated := true;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS k5a_read_candidates (
    unit_id uuid PRIMARY KEY,
    claim text NOT NULL,
    knowledge_type text NOT NULL,
    effective_attention real NOT NULL,
    source_event_id uuid NOT NULL,
    source_content text NOT NULL,
    source_created_at timestamptz NOT NULL,
    source_session_id text,
    source_sequence_num bigint NOT NULL,
    initial_rank integer NOT NULL
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS k5a_read_selected (
    unit_id uuid PRIMARY KEY,
    selected_rank integer NOT NULL,
    promoted boolean NOT NULL
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS k5a_read_annotation_queue (
    queue_order bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    unit_id uuid NOT NULL UNIQUE,
    selected_rank integer NOT NULL,
    processed boolean NOT NULL DEFAULT false
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS k5a_read_checked_assertions (
    edge_id uuid NOT NULL,
    assertion_attempt_id uuid NOT NULL,
    PRIMARY KEY (edge_id, assertion_attempt_id)
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS k5a_read_annotations (
    unit_id uuid NOT NULL,
    partner_unit_id uuid NOT NULL,
    relative_recency text NOT NULL CHECK (
      relative_recency IN ('newer', 'older', 'same')
    ),
    PRIMARY KEY (unit_id, partner_unit_id)
  ) ON COMMIT DROP;
  TRUNCATE k5a_read_annotations, k5a_read_checked_assertions,
    k5a_read_annotation_queue, k5a_read_selected, k5a_read_candidates;

  INSERT INTO k5a_read_candidates(
    unit_id, claim, knowledge_type, effective_attention,
    source_event_id, source_content, source_created_at, source_session_id,
    source_sequence_num, initial_rank
  )
  WITH scored AS MATERIALIZED (
    SELECT unit.id AS unit_id, unit.claim, unit.knowledge_type,
      public.knowledge_unit_effective_attention(
        unit.id, p_viewer_profile_id
      ) AS effective_attention,
      event.id AS source_event_id, event.content AS source_content,
      event.created_at AS source_created_at,
      event.metadata->>'session_id' AS source_session_id,
      event.sequence_num AS source_sequence_num
    FROM public.graph_nodes node
    JOIN public.knowledge_units unit
      ON node.kind = 'knowledge_unit' AND node.authority_id = unit.id
    JOIN public.knowledge_events event ON event.id = unit.source_event_id
    JOIN public.knowledge_audiences audience
      ON audience.id = unit.knowledge_audience_id
    WHERE node.id = ANY(v_seen)
      AND NOT unit.id = ANY(p_exclude_unit_ids)
      AND unit.knowledge_type IS NOT NULL
      AND unit.attention_score IS NOT NULL
      AND p_viewer_profile_id = ANY(audience.member_profile_ids)
      AND public.viewer_has_graph_node_grant(node.id, p_viewer_profile_id)
  )
  SELECT scored.unit_id, scored.claim, scored.knowledge_type,
    scored.effective_attention, scored.source_event_id,
    scored.source_content, scored.source_created_at,
    scored.source_session_id,
    scored.source_sequence_num,
    row_number() OVER (
      ORDER BY scored.effective_attention DESC,
        scored.source_created_at DESC, scored.unit_id
    )::integer
  FROM scored
  WHERE scored.effective_attention > 0;

  SELECT count(*) INTO v_candidate_count FROM k5a_read_candidates;
  IF v_candidate_count > p_claim_budget THEN v_truncated := true; END IF;
  INSERT INTO k5a_read_selected(unit_id, selected_rank, promoted)
  SELECT unit_id, initial_rank, false
  FROM k5a_read_candidates
  WHERE initial_rank <= p_claim_budget;
  INSERT INTO k5a_read_annotation_queue(unit_id, selected_rank)
  SELECT unit_id, selected_rank FROM k5a_read_selected
  ORDER BY selected_rank, unit_id;

  LOOP
    SELECT queue.unit_id, queue.selected_rank INTO v_claim
    FROM k5a_read_annotation_queue queue
    WHERE NOT queue.processed
    ORDER BY queue.selected_rank, queue.queue_order
    LIMIT 1;
    EXIT WHEN NOT FOUND OR v_stop;
    UPDATE k5a_read_annotation_queue SET processed = true
    WHERE unit_id = v_claim.unit_id;

    v_annotation_count := 0;
    FOR v_annotation IN
      SELECT annotation.partner_unit_id, annotation.edge_id,
        annotation.assertion_attempt_id, annotation.edge_kind,
        annotation.endpoint_is_source, annotation.input_unit_ids
      FROM public.knowledge_relation_annotation_index annotation
      WHERE annotation.endpoint_unit_id = v_claim.unit_id
        AND annotation.assertion_person_id = p_viewer_profile_id
      ORDER BY annotation.repair_priority,
        annotation.assertion_recorded_at DESC,
        annotation.edge_id, annotation.assertion_attempt_id
      LIMIT p_per_claim_partner_cap + 1
    LOOP
      v_annotation_count := v_annotation_count + 1;
      IF v_annotation_count > p_per_claim_partner_cap THEN
        v_truncated := true;
        EXIT;
      END IF;
      CONTINUE WHEN NOT EXISTS (
        SELECT 1 FROM k5a_read_candidates candidate
        WHERE candidate.unit_id = v_annotation.partner_unit_id
      );
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM k5a_read_checked_assertions checked
        WHERE checked.edge_id = v_annotation.edge_id
          AND checked.assertion_attempt_id = v_annotation.assertion_attempt_id
      );
      INSERT INTO k5a_read_checked_assertions(edge_id, assertion_attempt_id)
      VALUES (v_annotation.edge_id, v_annotation.assertion_attempt_id);

      v_checks_needed := cardinality(v_annotation.input_unit_ids);
      IF v_annotation_checks + v_checks_needed > p_annotation_check_budget THEN
        v_truncated := true;
        v_stop := true;
        EXIT;
      END IF;
      v_annotation_checks := v_annotation_checks + v_checks_needed;
      SELECT NOT EXISTS (
        SELECT 1
        FROM unnest(v_annotation.input_unit_ids) input_unit_id
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.graph_nodes input_node
          WHERE input_node.kind = 'knowledge_unit'
            AND input_node.authority_id = input_unit_id
            AND public.viewer_has_graph_node_grant(
              input_node.id, p_viewer_profile_id
            )
        )
      ) INTO v_partner_visible;
      CONTINUE WHEN NOT v_partner_visible;

      INSERT INTO k5a_read_selected(unit_id, selected_rank, promoted)
      VALUES (v_annotation.partner_unit_id, v_claim.selected_rank, true)
      ON CONFLICT (unit_id) DO UPDATE SET selected_rank = least(
        k5a_read_selected.selected_rank, EXCLUDED.selected_rank
      );
      INSERT INTO k5a_read_annotations(
        unit_id, partner_unit_id, relative_recency
      )
      SELECT v_claim.unit_id, v_annotation.partner_unit_id,
        CASE WHEN own.source_sequence_num > partner.source_sequence_num
          THEN 'newer'
          WHEN own.source_sequence_num < partner.source_sequence_num
          THEN 'older' ELSE 'same' END
      FROM k5a_read_candidates own, k5a_read_candidates partner
      WHERE own.unit_id = v_claim.unit_id
        AND partner.unit_id = v_annotation.partner_unit_id
      ON CONFLICT DO NOTHING;
      INSERT INTO k5a_read_annotations(
        unit_id, partner_unit_id, relative_recency
      )
      SELECT v_annotation.partner_unit_id, v_claim.unit_id,
        CASE WHEN partner.source_sequence_num > own.source_sequence_num
          THEN 'newer'
          WHEN partner.source_sequence_num < own.source_sequence_num
          THEN 'older' ELSE 'same' END
      FROM k5a_read_candidates own, k5a_read_candidates partner
      WHERE own.unit_id = v_claim.unit_id
        AND partner.unit_id = v_annotation.partner_unit_id
      ON CONFLICT DO NOTHING;

      IF v_annotation.edge_kind = 'supersedes'
        AND NOT v_annotation.endpoint_is_source
        AND NOT EXISTS (
          SELECT 1 FROM k5a_read_annotation_queue queue
          WHERE queue.unit_id = v_annotation.partner_unit_id
        ) THEN
        IF v_closure_steps >= p_closure_budget
          OR v_annotation_checks + 1 > p_annotation_check_budget THEN
          v_truncated := true;
        ELSE
          v_closure_steps := v_closure_steps + 1;
          v_annotation_checks := v_annotation_checks + 1;
          INSERT INTO k5a_read_annotation_queue(unit_id, selected_rank)
          VALUES (v_annotation.partner_unit_id, v_claim.selected_rank);
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'knowledgeUnitId', candidate.unit_id,
    'claim', candidate.claim,
    'knowledgeType', candidate.knowledge_type,
    'attentionScore', candidate.effective_attention,
    'sourceEventId', candidate.source_event_id,
    'sourceContent', candidate.source_content,
    'sourceCreatedAt', candidate.source_created_at,
    'sessionId', candidate.source_session_id,
    'tensions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'withUnitId', annotation.partner_unit_id,
        'relativeRecency', annotation.relative_recency
      ) ORDER BY annotation.partner_unit_id)
      FROM k5a_read_annotations annotation
      WHERE annotation.unit_id = candidate.unit_id
    ), '[]'::jsonb)
  ) ORDER BY selected.selected_rank, candidate.source_created_at DESC,
    candidate.unit_id), '[]'::jsonb)
  INTO v_claims
  FROM k5a_read_selected selected
  JOIN k5a_read_candidates candidate ON candidate.unit_id = selected.unit_id;
  RETURN jsonb_build_object('claims', v_claims, 'truncated', v_truncated);
END
$$;

COMMIT;
