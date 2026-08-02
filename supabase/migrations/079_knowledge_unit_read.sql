-- K5a stage 2: assertion-person-keyed annotation and unit-native reads.
--
-- The selecting read may enumerate only the viewer's own relation assertions.
-- This append-only companion gives that rule a bounded physical access path:
-- one oriented row per assertion endpoint, written in the assertion transaction.

BEGIN;

CREATE TABLE IF NOT EXISTS public.knowledge_relation_annotation_index (
  endpoint_unit_id uuid NOT NULL
    REFERENCES public.knowledge_units(id) ON DELETE RESTRICT,
  partner_unit_id uuid NOT NULL
    REFERENCES public.knowledge_units(id) ON DELETE RESTRICT,
  assertion_person_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  edge_id uuid NOT NULL,
  assertion_attempt_id uuid NOT NULL,
  edge_kind public.graph_edge_kind NOT NULL CHECK (
    edge_kind IN ('contradicts', 'supersedes')
  ),
  endpoint_is_source boolean NOT NULL,
  repair_priority smallint NOT NULL CHECK (
    (edge_kind = 'supersedes' AND NOT endpoint_is_source AND repair_priority = 0)
    OR (edge_kind = 'contradicts' AND repair_priority = 1)
    OR (edge_kind = 'supersedes' AND endpoint_is_source AND repair_priority = 2)
  ),
  input_unit_ids uuid[] NOT NULL CHECK (cardinality(input_unit_ids) >= 2),
  assertion_recorded_at timestamptz NOT NULL,
  PRIMARY KEY (
    endpoint_unit_id, assertion_person_id, edge_id, assertion_attempt_id
  ),
  CONSTRAINT knowledge_relation_annotation_index_distinct_endpoints CHECK (
    endpoint_unit_id <> partner_unit_id
  ),
  CONSTRAINT knowledge_relation_annotation_index_assertion_fkey
    FOREIGN KEY (edge_id, assertion_attempt_id)
    REFERENCES public.knowledge_relation_assertions(edge_id, attempt_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS knowledge_relation_annotation_own_lookup
  ON public.knowledge_relation_annotation_index(
    endpoint_unit_id, assertion_person_id, repair_priority,
    assertion_recorded_at DESC, edge_id, assertion_attempt_id
  ) INCLUDE (
    partner_unit_id, edge_kind, endpoint_is_source, input_unit_ids
  );

CREATE OR REPLACE FUNCTION public.project_knowledge_relation_annotation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_attempt public.knowledge_relation_attempts;
  v_edge public.graph_edges;
  v_source_unit_id uuid;
  v_target_unit_id uuid;
BEGIN
  SELECT * INTO STRICT v_attempt
  FROM public.knowledge_relation_attempts
  WHERE id = NEW.attempt_id;
  SELECT * INTO STRICT v_edge
  FROM public.graph_edges
  WHERE id = NEW.edge_id;
  IF v_edge.kind NOT IN ('contradicts', 'supersedes') THEN
    RAISE EXCEPTION 'knowledge_relation_annotation_edge_kind_invalid'
      USING ERRCODE = '23514';
  END IF;
  SELECT authority_id INTO STRICT v_source_unit_id
  FROM public.graph_nodes
  WHERE id = v_edge.source_node_id AND kind = 'knowledge_unit';
  SELECT authority_id INTO STRICT v_target_unit_id
  FROM public.graph_nodes
  WHERE id = v_edge.target_node_id AND kind = 'knowledge_unit';
  IF v_source_unit_id = v_target_unit_id
    OR NOT v_source_unit_id = ANY(NEW.input_unit_ids)
    OR NOT v_target_unit_id = ANY(NEW.input_unit_ids) THEN
    RAISE EXCEPTION 'knowledge_relation_annotation_input_shape_invalid'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.knowledge_relation_annotation_index(
    endpoint_unit_id, partner_unit_id, assertion_person_id,
    edge_id, assertion_attempt_id, edge_kind, endpoint_is_source,
    repair_priority, input_unit_ids, assertion_recorded_at
  ) VALUES
    (v_source_unit_id, v_target_unit_id, v_attempt.person_id,
      NEW.edge_id, NEW.attempt_id, v_edge.kind, true,
      CASE WHEN v_edge.kind = 'contradicts' THEN 1 ELSE 2 END,
      NEW.input_unit_ids, NEW.recorded_at),
    (v_target_unit_id, v_source_unit_id, v_attempt.person_id,
      NEW.edge_id, NEW.attempt_id, v_edge.kind, false,
      CASE WHEN v_edge.kind = 'contradicts' THEN 1 ELSE 0 END,
      NEW.input_unit_ids, NEW.recorded_at)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_knowledge_relation_annotation_project
  ON public.knowledge_relation_assertions;
CREATE TRIGGER trg_knowledge_relation_annotation_project
  AFTER INSERT ON public.knowledge_relation_assertions
  FOR EACH ROW EXECUTE FUNCTION public.project_knowledge_relation_annotation();

-- Existing assertions are projected with the same orientation and priority as
-- future trigger writes. Re-running the migration is safe and fills only gaps.
INSERT INTO public.knowledge_relation_annotation_index(
  endpoint_unit_id, partner_unit_id, assertion_person_id,
  edge_id, assertion_attempt_id, edge_kind, endpoint_is_source,
  repair_priority, input_unit_ids, assertion_recorded_at
)
SELECT oriented.endpoint_unit_id, oriented.partner_unit_id, attempt.person_id,
  assertion.edge_id, assertion.attempt_id, edge.kind,
  oriented.endpoint_is_source, oriented.repair_priority,
  assertion.input_unit_ids, assertion.recorded_at
FROM public.knowledge_relation_assertions assertion
JOIN public.knowledge_relation_attempts attempt
  ON attempt.id = assertion.attempt_id
JOIN public.graph_edges edge ON edge.id = assertion.edge_id
JOIN public.graph_nodes source_node
  ON source_node.id = edge.source_node_id
  AND source_node.kind = 'knowledge_unit'
JOIN public.graph_nodes target_node
  ON target_node.id = edge.target_node_id
  AND target_node.kind = 'knowledge_unit'
CROSS JOIN LATERAL (VALUES
  (source_node.authority_id, target_node.authority_id, true,
    CASE WHEN edge.kind = 'contradicts' THEN 1 ELSE 2 END),
  (target_node.authority_id, source_node.authority_id, false,
    CASE WHEN edge.kind = 'contradicts' THEN 1 ELSE 0 END)
) oriented(
  endpoint_unit_id, partner_unit_id, endpoint_is_source, repair_priority
)
WHERE edge.kind IN ('contradicts', 'supersedes')
  AND source_node.authority_id <> target_node.authority_id
  AND source_node.authority_id = ANY(assertion.input_unit_ids)
  AND target_node.authority_id = ANY(assertion.input_unit_ids)
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.knowledge_relation_assertions assertion
    JOIN public.knowledge_relation_attempts attempt
      ON attempt.id = assertion.attempt_id
    WHERE (
      SELECT count(*)
      FROM public.knowledge_relation_annotation_index annotation
      WHERE annotation.edge_id = assertion.edge_id
        AND annotation.assertion_attempt_id = assertion.attempt_id
        AND annotation.assertion_person_id = attempt.person_id
    ) <> 2
  ) THEN
    RAISE EXCEPTION 'knowledge_relation_annotation_backfill_incomplete';
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_knowledge_relation_annotation_index_immutable
  ON public.knowledge_relation_annotation_index;
CREATE TRIGGER trg_knowledge_relation_annotation_index_immutable
  BEFORE UPDATE OR DELETE ON public.knowledge_relation_annotation_index
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();

ALTER TABLE public.knowledge_relation_annotation_index ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.knowledge_relation_annotation_index
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.knowledge_relation_annotation_index TO service_role;

REVOKE EXECUTE ON FUNCTION public.project_knowledge_relation_annotation()
FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.knowledge_units
  ADD COLUMN IF NOT EXISTS claim_search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', claim)) STORED;
CREATE INDEX IF NOT EXISTS knowledge_units_claim_search
  ON public.knowledge_units USING gin(claim_search_vector);
CREATE INDEX IF NOT EXISTS knowledge_audiences_member_profile_ids_lookup
  ON public.knowledge_audiences USING gin(member_profile_ids);
CREATE INDEX IF NOT EXISTS knowledge_units_audience_lookup
  ON public.knowledge_units(knowledge_audience_id, id)
  WHERE embedding IS NOT NULL
    AND knowledge_type IS NOT NULL
    AND attention_score > 0;

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
    source_event_id, source_content, source_created_at,
    source_sequence_num, initial_rank
  )
  WITH scored AS MATERIALIZED (
    SELECT unit.id AS unit_id, unit.claim, unit.knowledge_type,
      public.knowledge_unit_effective_attention(
        unit.id, p_viewer_profile_id
      ) AS effective_attention,
      event.id AS source_event_id, event.content AS source_content,
      event.created_at AS source_created_at,
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

CREATE OR REPLACE FUNCTION public.search_knowledge_units(
  p_viewer_profile_id uuid,
  p_query_embedding vector(1536) DEFAULT NULL,
  p_match_threshold double precision DEFAULT 0.6,
  p_match_count integer DEFAULT 20,
  p_anchor_person_id uuid DEFAULT NULL,
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL,
  p_unit_ids uuid[] DEFAULT NULL
) RETURNS TABLE(
  unit_id uuid, claim text, source_event_id uuid, source_content text,
  source_created_at timestamptz, knowledge_type text,
  effective_attention real, similarity double precision
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_viewer_profile_id IS NULL
    OR p_match_threshold IS NULL OR p_match_threshold NOT BETWEEN 0 AND 1
    OR p_match_count IS NULL OR p_match_count NOT BETWEEN 1 AND 50
    OR (p_since IS NOT NULL AND p_until IS NOT NULL AND p_since > p_until)
    OR (p_unit_ids IS NOT NULL AND cardinality(p_unit_ids) > 50)
    OR (p_query_embedding IS NOT NULL AND (
      p_anchor_person_id IS NOT NULL OR p_since IS NOT NULL
      OR p_until IS NOT NULL OR p_unit_ids IS NOT NULL
    ))
    OR (p_query_embedding IS NULL AND p_anchor_person_id IS NULL
      AND p_since IS NULL AND p_until IS NULL AND p_unit_ids IS NULL) THEN
    RAISE EXCEPTION 'knowledge_unit_search_input_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF p_query_embedding IS NOT NULL THEN
    RETURN QUERY
    WITH viewer_audiences AS MATERIALIZED (
      SELECT audience.id
      FROM public.knowledge_audiences audience
      WHERE audience.member_profile_ids @> ARRAY[p_viewer_profile_id]::uuid[]
    ), authorized_unit_ids AS MATERIALIZED (
      SELECT unit.id
      FROM viewer_audiences audience
      CROSS JOIN LATERAL (
        SELECT candidate.id
        FROM public.knowledge_units candidate
        WHERE candidate.knowledge_audience_id = audience.id
          AND candidate.embedding IS NOT NULL
          AND candidate.knowledge_type IS NOT NULL
          AND candidate.attention_score > 0
        ORDER BY candidate.id
        OFFSET 0
      ) unit
    ), authorized AS MATERIALIZED (
      SELECT unit.id AS unit_id, unit.claim,
        event.id AS source_event_id, event.content AS source_content,
        event.created_at AS source_created_at, unit.knowledge_type,
        unit.embedding <=> p_query_embedding AS distance
      FROM authorized_unit_ids authorized_id
      CROSS JOIN LATERAL (
        SELECT candidate.*
        FROM public.knowledge_units candidate
        WHERE candidate.id = authorized_id.id
        OFFSET 0
      ) unit
      CROSS JOIN LATERAL (
        SELECT source.id, source.content, source.created_at
        FROM public.knowledge_events source
        WHERE source.id = unit.source_event_id
        OFFSET 0
      ) event
      WHERE unit.embedding IS NOT NULL
        AND unit.knowledge_type IS NOT NULL
        AND unit.attention_score IS NOT NULL
        AND unit.attention_score > 0
        AND NOT EXISTS (
          SELECT 1 FROM public.knowledge_unit_citations retirement
          WHERE retirement.knowledge_unit_id = unit.id
            AND retirement.person_id = p_viewer_profile_id
            AND retirement.act_kind = 'retired'
        )
        AND public.viewer_has_graph_node_grant(
          public.canonical_graph_node_id('knowledge_unit', unit.id),
          p_viewer_profile_id
        )
    ), scored AS MATERIALIZED (
      SELECT authorized.*,
        public.knowledge_unit_effective_attention(
          authorized.unit_id, p_viewer_profile_id
        ) AS effective_attention
      FROM authorized
    )
    SELECT scored.unit_id, scored.claim,
      scored.source_event_id, scored.source_content,
      scored.source_created_at, scored.knowledge_type,
      scored.effective_attention, 1 - scored.distance
    FROM scored
    WHERE scored.effective_attention > 0
      AND 1 - scored.distance >= p_match_threshold
    ORDER BY scored.distance, scored.unit_id
    LIMIT p_match_count;
    RETURN;
  END IF;
  RETURN QUERY
  WITH anchor_root AS MATERIALIZED (
    SELECT node.id
    FROM public.graph_nodes node
    WHERE p_anchor_person_id IS NOT NULL
      AND node.kind = 'person'
      AND node.authority_id = p_anchor_person_id
      AND public.viewer_has_graph_node_grant(node.id, p_viewer_profile_id)
  ), reachable AS MATERIALIZED (
    SELECT walked.node_id
    FROM anchor_root root
    CROSS JOIN LATERAL public.traverse_knowledge_graph(
      root.id, p_viewer_profile_id, 8, NULL, 512, 128
    ) walked
  ), authorized AS MATERIALIZED (
    SELECT unit.id AS unit_id, unit.claim,
      event.id AS source_event_id, event.content AS source_content,
      event.created_at AS source_created_at, unit.knowledge_type,
      public.knowledge_unit_effective_attention(
        unit.id, p_viewer_profile_id
      ) AS effective_attention,
      NULL::double precision AS similarity
    FROM public.knowledge_units unit
    JOIN public.graph_nodes node
      ON node.kind = 'knowledge_unit' AND node.authority_id = unit.id
    JOIN public.knowledge_events event ON event.id = unit.source_event_id
    JOIN public.knowledge_audiences audience
      ON audience.id = unit.knowledge_audience_id
    WHERE p_viewer_profile_id = ANY(audience.member_profile_ids)
      AND public.viewer_has_graph_node_grant(node.id, p_viewer_profile_id)
      AND unit.knowledge_type IS NOT NULL
      AND unit.attention_score IS NOT NULL
      AND (p_unit_ids IS NULL OR unit.id = ANY(p_unit_ids))
      AND (p_since IS NULL OR event.created_at >= p_since)
      AND (p_until IS NULL OR event.created_at <= p_until)
      AND (
        p_anchor_person_id IS NULL
        OR (event.actor_id = p_anchor_person_id AND node.id IN (
          SELECT reached.node_id FROM reachable reached
        ))
      )
  )
  SELECT authorized.unit_id, authorized.claim,
    authorized.source_event_id, authorized.source_content,
    authorized.source_created_at, authorized.knowledge_type,
    authorized.effective_attention, authorized.similarity
  FROM authorized
  WHERE authorized.effective_attention > 0
  ORDER BY authorized.source_created_at DESC, authorized.unit_id
  LIMIT p_match_count;
END
$$;

CREATE OR REPLACE FUNCTION public.keyword_search_units(
  p_viewer_profile_id uuid,
  p_query text,
  p_match_count integer DEFAULT 20,
  p_anchor_person_id uuid DEFAULT NULL
) RETURNS TABLE(
  unit_id uuid, claim text, source_event_id uuid, source_content text,
  source_created_at timestamptz, knowledge_type text,
  effective_attention real, rank_score double precision
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_viewer_profile_id IS NULL OR p_query IS NULL
    OR length(btrim(p_query)) = 0
    OR p_match_count IS NULL OR p_match_count NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'knowledge_unit_keyword_search_input_invalid'
      USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH anchor_root AS MATERIALIZED (
    SELECT node.id
    FROM public.graph_nodes node
    WHERE p_anchor_person_id IS NOT NULL
      AND node.kind = 'person'
      AND node.authority_id = p_anchor_person_id
      AND public.viewer_has_graph_node_grant(node.id, p_viewer_profile_id)
  ), reachable AS MATERIALIZED (
    SELECT walked.node_id
    FROM anchor_root root
    CROSS JOIN LATERAL public.traverse_knowledge_graph(
      root.id, p_viewer_profile_id, 8, NULL, 512, 128
    ) walked
  ), authorized AS MATERIALIZED (
    SELECT unit.id AS unit_id, unit.claim,
      event.id AS source_event_id, event.content AS source_content,
      event.created_at AS source_created_at, unit.knowledge_type,
      public.knowledge_unit_effective_attention(
        unit.id, p_viewer_profile_id
      ) AS effective_attention,
      ts_rank(
        unit.claim_search_vector, plainto_tsquery('english', p_query)
      )::double precision AS rank_score
    FROM public.knowledge_units unit
    JOIN public.graph_nodes node
      ON node.kind = 'knowledge_unit' AND node.authority_id = unit.id
    JOIN public.knowledge_events event ON event.id = unit.source_event_id
    JOIN public.knowledge_audiences audience
      ON audience.id = unit.knowledge_audience_id
    WHERE unit.claim_search_vector @@ plainto_tsquery('english', p_query)
      AND p_viewer_profile_id = ANY(audience.member_profile_ids)
      AND public.viewer_has_graph_node_grant(node.id, p_viewer_profile_id)
      AND unit.knowledge_type IS NOT NULL
      AND unit.attention_score IS NOT NULL
      AND (
        p_anchor_person_id IS NULL
        OR (event.actor_id = p_anchor_person_id AND node.id IN (
          SELECT reached.node_id FROM reachable reached
        ))
      )
  )
  SELECT authorized.unit_id, authorized.claim,
    authorized.source_event_id, authorized.source_content,
    authorized.source_created_at, authorized.knowledge_type,
    authorized.effective_attention, authorized.rank_score
  FROM authorized
  WHERE authorized.effective_attention > 0
  ORDER BY authorized.rank_score DESC,
    authorized.source_created_at DESC, authorized.unit_id
  LIMIT p_match_count;
END
$$;

REVOKE EXECUTE ON FUNCTION public.retrieve_knowledge_graph_claims_v3(
  uuid, uuid, uuid[], integer, integer, integer, integer,
  integer, integer, integer
), public.search_knowledge_units(
  uuid, vector, double precision, integer, uuid,
  timestamptz, timestamptz, uuid[]
), public.keyword_search_units(uuid, text, integer, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retrieve_knowledge_graph_claims_v3(
  uuid, uuid, uuid[], integer, integer, integer, integer,
  integer, integer, integer
), public.search_knowledge_units(
  uuid, vector, double precision, integer, uuid,
  timestamptz, timestamptz, uuid[]
), public.keyword_search_units(uuid, text, integer, uuid)
TO service_role;

COMMIT;
