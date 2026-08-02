\set ON_ERROR_STOP on

-- K5a C3 remains a disposable selecting-read proof. Migration 079 owns the
-- durable annotation projection; the function below proves the R3 algorithm
-- against that real table without installing a production read function.
CREATE TABLE public.k5a_c3_unit_distances (
  unit_id uuid NOT NULL REFERENCES public.knowledge_units(id),
  person_id uuid NOT NULL REFERENCES public.profiles(id),
  session_distance integer NOT NULL CHECK (session_distance >= 0),
  PRIMARY KEY (unit_id, person_id)
);

CREATE TABLE public.k5a_c3_citation_inputs (
  unit_id uuid NOT NULL REFERENCES public.knowledge_units(id),
  person_id uuid NOT NULL REFERENCES public.profiles(id),
  session_key text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('standing', 'reach', 'search')),
  session_distance integer NOT NULL CHECK (session_distance >= 0),
  PRIMARY KEY (unit_id, person_id, session_key, channel)
);

CREATE FUNCTION public.k5a_c3_effective_attention_poc(
  p_birth_attention real,
  p_knowledge_type text,
  p_session_distance integer,
  p_windowed_reach_citations integer
) RETURNS real
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog AS $$
DECLARE
  v_raw_factor numeric;
  v_factor numeric;
  v_decayed numeric;
BEGIN
  IF p_birth_attention NOT BETWEEN 0 AND 1
    OR p_knowledge_type NOT IN ('domain', 'operational', 'preference')
    OR p_session_distance < 0
    OR p_windowed_reach_citations < 0 THEN
    RAISE EXCEPTION 'k5a_c3_attention_input_invalid' USING ERRCODE = '22023';
  END IF;
  v_raw_factor := CASE
    WHEN p_session_distance <= 0 THEN 1
    WHEN p_session_distance = 1 THEN 0.9
    WHEN p_session_distance = 2 THEN 0.75
    WHEN p_session_distance = 3 THEN 0.5
    WHEN p_session_distance = 4 THEN 0.4
    ELSE 0.3
  END;
  IF p_knowledge_type = 'preference' THEN
    v_decayed := p_birth_attention;
  ELSE
    v_factor := CASE WHEN p_knowledge_type = 'domain'
      THEN 1 - ((1 - v_raw_factor) * 0.5)
      ELSE v_raw_factor END;
    v_decayed := round((p_birth_attention::numeric * v_factor), 2);
    IF p_knowledge_type = 'domain'
      AND p_session_distance >= 5
      AND p_windowed_reach_citations = 0 THEN
      v_decayed := greatest(
        0,
        round(v_decayed - ((p_session_distance - 5 + 1) * 0.1), 2)
      );
    END IF;
  END IF;
  RETURN least(
    1,
    v_decayed + (0.05 * p_windowed_reach_citations)
  )::real;
END
$$;

CREATE FUNCTION public.k5a_c3_selecting_read_poc(
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
SET search_path = pg_catalog, public
SET enable_seqscan = off
SET enable_bitmapscan = off AS $$
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
  v_claim_budget_truncated boolean := false;
  v_own_degree_truncated boolean := false;
  v_annotation_budget_truncated boolean := false;
  v_closure_budget_truncated boolean := false;
  v_claim record;
  v_annotation record;
  v_annotation_count integer;
  v_partner_visible boolean;
  v_checks_needed integer;
  v_stop boolean := false;
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
    RAISE EXCEPTION 'k5a_c3_selecting_input_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_root
  FROM public.graph_nodes
  WHERE kind = 'person'
    AND authority_id = p_root_authority_id
    AND public.viewer_has_graph_node_grant(id, p_viewer_profile_id);
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

  CREATE TEMP TABLE IF NOT EXISTS k5a_c3_candidates (
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
  CREATE TEMP TABLE IF NOT EXISTS k5a_c3_selected (
    unit_id uuid PRIMARY KEY REFERENCES k5a_c3_candidates(unit_id),
    selected_rank integer NOT NULL,
    promoted boolean NOT NULL
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS k5a_c3_annotation_queue (
    queue_order bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    unit_id uuid NOT NULL UNIQUE REFERENCES k5a_c3_candidates(unit_id),
    selected_rank integer NOT NULL,
    processed boolean NOT NULL DEFAULT false
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS k5a_c3_checked_assertions (
    edge_id uuid NOT NULL,
    assertion_attempt_id uuid NOT NULL,
    PRIMARY KEY (edge_id, assertion_attempt_id)
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS k5a_c3_annotations (
    unit_id uuid NOT NULL,
    partner_unit_id uuid NOT NULL,
    relative_recency text NOT NULL
      CHECK (relative_recency IN ('newer', 'older', 'same')),
    PRIMARY KEY (unit_id, partner_unit_id)
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS k5a_c3_diagnostics (
    claim_budget_truncated boolean NOT NULL,
    own_degree_truncated boolean NOT NULL,
    annotation_budget_truncated boolean NOT NULL,
    closure_budget_truncated boolean NOT NULL,
    annotation_checks integer NOT NULL,
    closure_steps integer NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE k5a_c3_diagnostics, k5a_c3_annotations, k5a_c3_checked_assertions,
    k5a_c3_annotation_queue, k5a_c3_selected, k5a_c3_candidates;

  INSERT INTO k5a_c3_candidates(
    unit_id, claim, knowledge_type, effective_attention,
    source_event_id, source_content, source_created_at,
    source_sequence_num, initial_rank
  )
  SELECT ranked.unit_id, ranked.claim, ranked.knowledge_type,
    ranked.effective_attention, ranked.source_event_id, ranked.source_content,
    ranked.source_created_at, ranked.source_sequence_num, ranked.initial_rank
  FROM (
    SELECT unit.id AS unit_id,
      unit.claim,
      unit.knowledge_type,
      public.k5a_c3_effective_attention_poc(
        unit.attention_score,
        unit.knowledge_type,
        coalesce(distance.session_distance, 0),
        coalesce(citations.eligible_count, 0)
      ) AS effective_attention,
      event.id AS source_event_id,
      event.content AS source_content,
      event.created_at AS source_created_at,
      event.sequence_num AS source_sequence_num,
      row_number() OVER (
        ORDER BY public.k5a_c3_effective_attention_poc(
          unit.attention_score,
          unit.knowledge_type,
          coalesce(distance.session_distance, 0),
          coalesce(citations.eligible_count, 0)
        ) DESC, event.created_at DESC, unit.id
      )::integer AS initial_rank
    FROM public.graph_nodes node
    JOIN public.knowledge_units unit
      ON node.kind = 'knowledge_unit' AND node.authority_id = unit.id
    JOIN public.knowledge_events event ON event.id = unit.source_event_id
    LEFT JOIN public.k5a_c3_unit_distances distance
      ON distance.unit_id = unit.id
      AND distance.person_id = p_viewer_profile_id
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS eligible_count
      FROM public.k5a_c3_citation_inputs citation
      WHERE citation.unit_id = unit.id
        AND citation.person_id = p_viewer_profile_id
        AND citation.channel IN ('reach', 'search')
        AND citation.session_distance BETWEEN 0 AND 5
    ) citations ON true
    WHERE node.id = ANY(v_seen)
      AND NOT unit.id = ANY(p_exclude_unit_ids)
      AND unit.knowledge_type IS NOT NULL
      AND unit.attention_score IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.knowledge_audiences audience
        WHERE audience.id = unit.knowledge_audience_id
          AND p_viewer_profile_id = ANY(audience.member_profile_ids)
      )
  ) ranked;

  SELECT count(*) INTO v_candidate_count FROM k5a_c3_candidates;
  IF v_candidate_count > p_claim_budget THEN
    v_truncated := true;
    v_claim_budget_truncated := true;
  END IF;
  INSERT INTO k5a_c3_selected(unit_id, selected_rank, promoted)
  SELECT unit_id, initial_rank, false
  FROM k5a_c3_candidates
  WHERE initial_rank <= p_claim_budget;
  INSERT INTO k5a_c3_annotation_queue(unit_id, selected_rank)
  SELECT unit_id, selected_rank FROM k5a_c3_selected
  ORDER BY selected_rank, unit_id;

  -- Walk and top-K are complete before pair repair. Each queue read is a
  -- bounded seek into the viewer's assertion-person partition. Newer-ward
  -- supersedes rows sort first; contradicts is one hop; older-ward rows last.
  LOOP
    SELECT queue.unit_id, queue.selected_rank
    INTO v_claim
    FROM k5a_c3_annotation_queue queue
    WHERE NOT queue.processed
    ORDER BY queue.selected_rank, queue.queue_order
    LIMIT 1;
    EXIT WHEN NOT FOUND OR v_stop;
    UPDATE k5a_c3_annotation_queue
    SET processed = true
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
        v_own_degree_truncated := true;
        EXIT;
      END IF;
      -- Bound the own-person index seek before checking walk membership. An
      -- excluded or unreachable partner still consumes own-degree capacity;
      -- otherwise finding cap+1 eligible rows could scan unbounded own rows.
      CONTINUE WHEN NOT EXISTS (
        SELECT 1 FROM k5a_c3_candidates candidate
        WHERE candidate.unit_id = v_annotation.partner_unit_id
      );
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM k5a_c3_checked_assertions checked
        WHERE checked.edge_id = v_annotation.edge_id
          AND checked.assertion_attempt_id = v_annotation.assertion_attempt_id
      );
      INSERT INTO k5a_c3_checked_assertions(edge_id, assertion_attempt_id)
      VALUES (v_annotation.edge_id, v_annotation.assertion_attempt_id);

      v_checks_needed := cardinality(v_annotation.input_unit_ids);
      IF v_annotation_checks + v_checks_needed > p_annotation_check_budget THEN
        v_truncated := true;
        v_annotation_budget_truncated := true;
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

      INSERT INTO k5a_c3_selected(unit_id, selected_rank, promoted)
      VALUES (v_annotation.partner_unit_id, v_claim.selected_rank, true)
      ON CONFLICT (unit_id) DO UPDATE
        SET selected_rank = least(
          k5a_c3_selected.selected_rank, EXCLUDED.selected_rank
        );
      INSERT INTO k5a_c3_annotations(
        unit_id, partner_unit_id, relative_recency
      )
      SELECT v_claim.unit_id, v_annotation.partner_unit_id,
        CASE WHEN own.source_sequence_num > partner.source_sequence_num THEN 'newer'
          WHEN own.source_sequence_num < partner.source_sequence_num THEN 'older'
          ELSE 'same' END
      FROM k5a_c3_candidates own, k5a_c3_candidates partner
      WHERE own.unit_id = v_claim.unit_id
        AND partner.unit_id = v_annotation.partner_unit_id
      ON CONFLICT DO NOTHING;
      INSERT INTO k5a_c3_annotations(
        unit_id, partner_unit_id, relative_recency
      )
      SELECT v_annotation.partner_unit_id, v_claim.unit_id,
        CASE WHEN partner.source_sequence_num > own.source_sequence_num THEN 'newer'
          WHEN partner.source_sequence_num < own.source_sequence_num THEN 'older'
          ELSE 'same' END
      FROM k5a_c3_candidates own, k5a_c3_candidates partner
      WHERE own.unit_id = v_claim.unit_id
        AND partner.unit_id = v_annotation.partner_unit_id
      ON CONFLICT DO NOTHING;

      IF v_annotation.edge_kind = 'supersedes'
        AND NOT v_annotation.endpoint_is_source
        AND NOT EXISTS (
          SELECT 1 FROM k5a_c3_annotation_queue queue
          WHERE queue.unit_id = v_annotation.partner_unit_id
        ) THEN
        IF v_closure_steps >= p_closure_budget
          OR v_annotation_checks + 1 > p_annotation_check_budget THEN
          -- The next newer unit is still returned with its tension; only its
          -- outgoing closure is omitted, which is the honest middle state.
          v_truncated := true;
          v_closure_budget_truncated :=
            v_closure_budget_truncated
            OR v_closure_steps >= p_closure_budget;
          v_annotation_budget_truncated :=
            v_annotation_budget_truncated
            OR v_annotation_checks + 1 > p_annotation_check_budget;
        ELSE
          v_closure_steps := v_closure_steps + 1;
          v_annotation_checks := v_annotation_checks + 1;
          INSERT INTO k5a_c3_annotation_queue(unit_id, selected_rank)
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
      FROM k5a_c3_annotations annotation
      WHERE annotation.unit_id = candidate.unit_id
    ), '[]'::jsonb)
  ) ORDER BY selected.selected_rank, candidate.source_created_at DESC,
    candidate.unit_id), '[]'::jsonb)
  INTO v_claims
  FROM k5a_c3_selected selected
  JOIN k5a_c3_candidates candidate ON candidate.unit_id = selected.unit_id;

  INSERT INTO k5a_c3_diagnostics(
    claim_budget_truncated, own_degree_truncated,
    annotation_budget_truncated, closure_budget_truncated,
    annotation_checks, closure_steps
  ) VALUES (
    v_claim_budget_truncated, v_own_degree_truncated,
    v_annotation_budget_truncated, v_closure_budget_truncated,
    v_annotation_checks, v_closure_steps
  );

  RETURN jsonb_build_object('claims', v_claims, 'truncated', v_truncated);
END
$$;

CREATE FUNCTION public.k5a_c3_seed_unit_poc(
  p_key text,
  p_claim text,
  p_attention real,
  p_knowledge_type text,
  p_room boolean
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
  v_event uuid;
  v_unit uuid := md5(format('k5a-c3-r3-poc-unit:%s', p_key))::uuid;
  v_audience uuid;
  v_unit_node uuid;
  v_event_node uuid;
  v_edge uuid;
  v_created_at timestamptz;
BEGIN
  SELECT event_id INTO STRICT v_event
  FROM public.claim_source_message_ingress(
    '72000000-0000-4000-8000-000000000001',
    'chat', p_key,
    CASE WHEN p_room THEN '72000000-0000-4000-8000-000000000011'::uuid END,
    CASE WHEN p_room THEN 'k3-proof' END,
    p_claim, 'message', 'conversation', 'user',
    CASE WHEN p_room THEN ARRAY[
      '72000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000002'
    ]::uuid[] ELSE ARRAY[
      '72000000-0000-4000-8000-000000000001'
    ]::uuid[] END,
    CASE WHEN p_room THEN ARRAY[
      '72000000-0000-4000-8000-000000000002'
    ]::uuid[] ELSE '{}'::uuid[] END,
    '{"session_id":"72000000-0000-4000-8000-000000000012"}',
    '{"conversation_id":"72000000-0000-4000-8000-000000000012","role":"user"}'
  );
  SELECT knowledge_audience_id, created_at
  INTO STRICT v_audience, v_created_at
  FROM public.knowledge_events WHERE id = v_event;
  INSERT INTO public.knowledge_units(
    id, claim, source_event_id, extractor_version, claim_key,
    knowledge_audience_id, knowledge_type, attention_score, embedding
  ) VALUES (
    v_unit, p_claim, v_event, 'cartographer-single-claim-v4', 'claim:0',
    v_audience, p_knowledge_type, p_attention,
    array_fill(0.01::real, ARRAY[1536])::vector
  );
  v_unit_node := public.canonical_graph_node_id('knowledge_unit', v_unit);
  v_event_node := public.canonical_graph_node_id('message_event', v_event);
  INSERT INTO public.graph_nodes(id, kind, authority_id, label)
  VALUES (v_unit_node, 'knowledge_unit', v_unit, p_claim);
  INSERT INTO public.graph_node_grants(
    node_id, knowledge_audience_id, basis_kind, basis_id, basis_version,
    label_snapshot, granted_at
  ) VALUES (
    v_unit_node, v_audience, 'source_event', v_event, 1,
    p_claim, v_created_at
  );
  v_edge := public.canonical_graph_edge_id(
    v_unit_node, 'derived_from', v_event_node
  );
  INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)
  VALUES (v_edge, v_unit_node, v_event_node, 'derived_from');
  INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)
  VALUES (v_edge, v_event);
  RETURN v_unit;
END
$$;

CREATE FUNCTION public.k5a_c3_seed_relation_poc(
  p_source_unit_id uuid,
  p_target_unit_id uuid,
  p_assertion_person_id uuid,
  p_kind public.graph_edge_kind,
  p_attempt_number integer,
  p_private_input_unit_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
  v_attempt uuid := md5(format(
    'k5a-c3-r3-poc-attempt:%s:%s:%s:%s:%s',
    p_source_unit_id, p_target_unit_id, p_assertion_person_id,
    p_kind, p_attempt_number
  ))::uuid;
  v_lease uuid := md5(format('k5a-c3-r3-poc-lease:%s', v_attempt))::uuid;
  v_source_node uuid := public.canonical_graph_node_id(
    'knowledge_unit', p_source_unit_id
  );
  v_target_node uuid := public.canonical_graph_node_id(
    'knowledge_unit', p_target_unit_id
  );
  v_edge uuid;
  v_inputs uuid[] := ARRAY[p_source_unit_id, p_target_unit_id];
BEGIN
  IF p_kind NOT IN ('contradicts', 'supersedes') THEN
    RAISE EXCEPTION 'k5a_c3_seed_relation_kind_invalid';
  END IF;
  IF p_private_input_unit_id IS NOT NULL THEN
    v_inputs := v_inputs || p_private_input_unit_id;
  END IF;
  INSERT INTO public.knowledge_relation_attempts(
    id, unit_id, person_id, contract_version, attempt_number,
    candidate_unit_ids, model_provider, model_id, resolver_label, lease_token
  ) VALUES (
    v_attempt, p_source_unit_id, p_assertion_person_id,
    'relation-conflict-v2', p_attempt_number, ARRAY[p_target_unit_id],
    'proof', 'c3-r3-poc', 'seeded-corpus', v_lease
  );
  v_edge := public.canonical_graph_edge_id(
    v_source_node, p_kind, v_target_node
  );
  INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)
  VALUES (v_edge, v_source_node, v_target_node, p_kind)
  ON CONFLICT (source_node_id, target_node_id, kind) DO NOTHING;
  INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)
  SELECT v_edge, source_event_id
  FROM public.knowledge_units
  WHERE id IN (p_source_unit_id, p_target_unit_id)
  ON CONFLICT (edge_id, evidence_event_id) DO NOTHING;
  INSERT INTO public.knowledge_relation_assertions(
    edge_id, input_unit_ids, contract_version, attempt_id
  ) VALUES (v_edge, v_inputs, 'relation-conflict-v2', v_attempt);
  RETURN v_edge;
END
$$;

CREATE TEMP TABLE k5a_c3_units(name text PRIMARY KEY, id uuid NOT NULL);
DO $k5a_c3_seed$
DECLARE
  v_owner uuid := '72000000-0000-4000-8000-000000000001';
  v_member uuid := '72000000-0000-4000-8000-000000000002';
  v_stale uuid;
  v_correction uuid;
  v_suppressed_top uuid;
  v_suppressed_low uuid;
  v_private_input uuid;
  v_old uuid;
  v_high_focus uuid;
  v_high_partner uuid;
  v_chain_a uuid;
  v_chain_b uuid;
  v_chain_c uuid;
  v_chain_d uuid;
  v_chain_x uuid;
  v_foreign_focus uuid;
  v_foreign_own uuid;
  i integer;
BEGIN
  INSERT INTO k5a_c3_units VALUES
    ('stale', public.k5a_c3_seed_unit_poc(
      'stale', 'The delivery window still closes at 5pm.', 0.95,
      'operational', true)),
    ('fresh', public.k5a_c3_seed_unit_poc(
      'fresh', 'The new permit was approved this morning.', 0.90,
      'operational', true)),
    ('suppressed-top', public.k5a_c3_seed_unit_poc(
      'suppressed-top', 'The rehearsal starts at six.', 0.85,
      'operational', true)),
    ('correction', public.k5a_c3_seed_unit_poc(
      'correction', 'The delivery window now closes at 3pm.', 0.20,
      'operational', true)),
    ('suppressed-low', public.k5a_c3_seed_unit_poc(
      'suppressed-low', 'The private schedule moved rehearsal to eight.',
      0.10, 'operational', true)),
    ('private-input', public.k5a_c3_seed_unit_poc(
      'private-input', 'The director privately requested a later start.',
      0.70, 'operational', false)),
    ('standing', public.k5a_c3_seed_unit_poc(
      'standing', 'Always show temperatures in Celsius.', 0.99,
      'preference', true)),
    ('baseline-top', public.k5a_c3_seed_unit_poc(
      'baseline-top', 'The baseline rehearsal starts at six.', 0.85,
      'operational', true)),
    ('baseline-low', public.k5a_c3_seed_unit_poc(
      'baseline-low', 'The baseline rehearsal may start at eight.', 0.10,
      'operational', true)),
    ('old-standing', public.k5a_c3_seed_unit_poc(
      'old-standing', 'The older planning note remains tentative.', 0.60,
      'operational', true)),
    ('high-focus', public.k5a_c3_seed_unit_poc(
      'high-focus', 'The high-degree focus changed.', 0.92,
      'operational', true)),
    ('chain-a', public.k5a_c3_seed_unit_poc(
      'chain-a', 'Chain A is the old instruction.', 0.96,
      'operational', true)),
    ('chain-b', public.k5a_c3_seed_unit_poc(
      'chain-b', 'Chain B supersedes A.', 0.08,
      'operational', true)),
    ('chain-c', public.k5a_c3_seed_unit_poc(
      'chain-c', 'Chain C supersedes B.', 0.07,
      'operational', true)),
    ('chain-d', public.k5a_c3_seed_unit_poc(
      'chain-d', 'Chain D supersedes C.', 0.06,
      'operational', true)),
    ('chain-x', public.k5a_c3_seed_unit_poc(
      'chain-x', 'Chain X contradicts B.', 0.05,
      'operational', true)),
    ('foreign-focus', public.k5a_c3_seed_unit_poc(
      'foreign-focus', 'Foreign fan-in focus.', 0.94,
      'operational', true)),
    ('foreign-own', public.k5a_c3_seed_unit_poc(
      'foreign-own', 'Viewer-owned correction for foreign fan-in focus.', 0.04,
      'operational', true));

  SELECT id INTO STRICT v_stale FROM k5a_c3_units WHERE name = 'stale';
  SELECT id INTO STRICT v_correction FROM k5a_c3_units WHERE name = 'correction';
  SELECT id INTO STRICT v_suppressed_top FROM k5a_c3_units
    WHERE name = 'suppressed-top';
  SELECT id INTO STRICT v_suppressed_low FROM k5a_c3_units
    WHERE name = 'suppressed-low';
  SELECT id INTO STRICT v_private_input FROM k5a_c3_units
    WHERE name = 'private-input';
  SELECT id INTO STRICT v_old FROM k5a_c3_units WHERE name = 'old-standing';
  SELECT id INTO STRICT v_high_focus FROM k5a_c3_units WHERE name = 'high-focus';
  SELECT id INTO STRICT v_chain_a FROM k5a_c3_units WHERE name = 'chain-a';
  SELECT id INTO STRICT v_chain_b FROM k5a_c3_units WHERE name = 'chain-b';
  SELECT id INTO STRICT v_chain_c FROM k5a_c3_units WHERE name = 'chain-c';
  SELECT id INTO STRICT v_chain_d FROM k5a_c3_units WHERE name = 'chain-d';
  SELECT id INTO STRICT v_chain_x FROM k5a_c3_units WHERE name = 'chain-x';
  SELECT id INTO STRICT v_foreign_focus FROM k5a_c3_units
    WHERE name = 'foreign-focus';
  SELECT id INTO STRICT v_foreign_own FROM k5a_c3_units
    WHERE name = 'foreign-own';

  PERFORM public.k5a_c3_seed_relation_poc(
    v_correction, v_stale, v_member, 'supersedes', 1
  );
  PERFORM public.k5a_c3_seed_relation_poc(
    v_suppressed_low, v_suppressed_top, v_owner, 'supersedes', 1,
    v_private_input
  );
  PERFORM public.k5a_c3_seed_relation_poc(
    v_chain_b, v_chain_a, v_member, 'supersedes', 1
  );
  PERFORM public.k5a_c3_seed_relation_poc(
    v_chain_c, v_chain_b, v_member, 'supersedes', 1
  );
  PERFORM public.k5a_c3_seed_relation_poc(
    v_chain_d, v_chain_c, v_member, 'supersedes', 1
  );
  PERFORM public.k5a_c3_seed_relation_poc(
    v_chain_b, v_chain_x, v_member, 'contradicts', 2
  );
  PERFORM public.k5a_c3_seed_relation_poc(
    v_foreign_own, v_foreign_focus, v_member, 'supersedes', 1
  );

  FOR i IN 1..8 LOOP
    v_high_partner := public.k5a_c3_seed_unit_poc(
      format('high-partner-%s', i),
      format('High-degree partner %s.', i),
      0.05 + (i * 0.001), 'operational', true
    );
    INSERT INTO k5a_c3_units VALUES (format('high-partner-%s', i), v_high_partner);
    PERFORM public.k5a_c3_seed_relation_poc(
      v_high_partner, v_high_focus, v_member, 'supersedes', 1
    );
  END LOOP;

  INSERT INTO public.k5a_c3_unit_distances(unit_id, person_id, session_distance)
  VALUES (v_old, v_member, 5);
  FOR i IN 1..12 LOOP
    INSERT INTO public.k5a_c3_citation_inputs(
      unit_id, person_id, session_key, channel, session_distance
    ) VALUES (v_old, v_member, format('standing-%s', i), 'standing', i % 6);
  END LOOP;
  INSERT INTO public.k5a_c3_citation_inputs(
    unit_id, person_id, session_key, channel, session_distance
  ) VALUES (v_old, v_member, 'expired-reach', 'reach', 6);

  IF public.k5a_c3_effective_attention_poc(0.6, 'operational', 5, 0)
      >= public.k5a_c3_effective_attention_poc(0.9, 'operational', 0, 0)
    OR public.k5a_c3_effective_attention_poc(0.6, 'operational', 5, 0)
      IS DISTINCT FROM public.k5a_c3_effective_attention_poc(
        0.6, 'operational', 5,
        (SELECT count(*)::integer
         FROM public.k5a_c3_citation_inputs citation
         WHERE citation.unit_id = v_old AND citation.person_id = v_member
           AND citation.channel IN ('reach', 'search')
           AND citation.session_distance BETWEEN 0 AND 5)
      ) THEN
    RAISE EXCEPTION 'k5a_c3_standing_entrenchment_returned';
  END IF;
END
$k5a_c3_seed$;

DO $k5a_c3_assertions$
DECLARE
  v_owner uuid := '72000000-0000-4000-8000-000000000001';
  v_member uuid := '72000000-0000-4000-8000-000000000002';
  v_result jsonb;
  v_suppressed jsonb;
  v_baseline jsonb;
  v_high_degree jsonb;
  v_chain_full jsonb;
  v_chain_priority jsonb;
  v_chain_bounded jsonb;
  v_foreign_before jsonb;
  v_foreign_after jsonb;
  v_plan_before jsonb;
  v_plan_after jsonb;
  v_suppressed_plan jsonb;
  v_exclusions uuid[];
  v_stale uuid;
  v_fresh uuid;
  v_correction uuid;
  v_suppressed_top uuid;
  v_suppressed_low uuid;
  v_private_input uuid;
  v_high_focus uuid;
  v_chain_a uuid;
  v_chain_b uuid;
  v_chain_c uuid;
  v_chain_d uuid;
  v_chain_x uuid;
  v_foreign_focus uuid;
  v_foreign_own uuid;
  v_started timestamptz;
  v_index_before_elapsed double precision;
  v_index_after_elapsed double precision;
  v_reader_before_elapsed double precision;
  v_reader_after_elapsed double precision;
  i integer;
BEGIN
  -- R3 treats non-enumeration as an authorization mechanism, not a planner
  -- preference. Force every annotation lookup through its person-keyed index,
  -- including on a tiny relation where PostgreSQL would prefer a heap scan.
  SET LOCAL enable_seqscan = off;
  SET LOCAL enable_bitmapscan = off;
  SELECT id INTO STRICT v_stale FROM k5a_c3_units WHERE name = 'stale';
  SELECT id INTO STRICT v_fresh FROM k5a_c3_units WHERE name = 'fresh';
  SELECT id INTO STRICT v_correction FROM k5a_c3_units WHERE name = 'correction';
  SELECT id INTO STRICT v_suppressed_top FROM k5a_c3_units
    WHERE name = 'suppressed-top';
  SELECT id INTO STRICT v_suppressed_low FROM k5a_c3_units
    WHERE name = 'suppressed-low';
  SELECT id INTO STRICT v_private_input FROM k5a_c3_units
    WHERE name = 'private-input';
  SELECT id INTO STRICT v_high_focus FROM k5a_c3_units WHERE name = 'high-focus';
  SELECT id INTO STRICT v_chain_a FROM k5a_c3_units WHERE name = 'chain-a';
  SELECT id INTO STRICT v_chain_b FROM k5a_c3_units WHERE name = 'chain-b';
  SELECT id INTO STRICT v_chain_c FROM k5a_c3_units WHERE name = 'chain-c';
  SELECT id INTO STRICT v_chain_d FROM k5a_c3_units WHERE name = 'chain-d';
  SELECT id INTO STRICT v_chain_x FROM k5a_c3_units WHERE name = 'chain-x';
  SELECT id INTO STRICT v_foreign_focus FROM k5a_c3_units
    WHERE name = 'foreign-focus';
  SELECT id INTO STRICT v_foreign_own FROM k5a_c3_units
    WHERE name = 'foreign-own';

  SELECT array_agg(id ORDER BY id) INTO v_exclusions
  FROM public.knowledge_units
  WHERE id NOT IN (
    v_stale, v_fresh, v_correction, v_suppressed_top,
    v_suppressed_low, v_private_input
  );
  v_result := public.k5a_c3_selecting_read_poc(
    v_member, v_member, v_exclusions, 3, 8, 48, 16, 8, 512, 128
  );
  IF v_result->>'truncated' <> 'true'
    OR jsonb_array_length(v_result->'claims') <> 4
    OR NOT ARRAY[v_stale, v_fresh, v_suppressed_top, v_correction] <@ ARRAY(
      SELECT (claim->>'knowledgeUnitId')::uuid
      FROM jsonb_array_elements(v_result->'claims') claim
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_result->'claims') claim
      WHERE (claim->>'knowledgeUnitId')::uuid IN (
        v_suppressed_low, v_private_input
      )
    )
    OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_result->'claims') claim
      CROSS JOIN LATERAL jsonb_array_elements(claim->'tensions') tension
      WHERE (claim->>'knowledgeUnitId')::uuid = v_correction
        AND (tension->>'withUnitId')::uuid = v_stale
        AND tension->>'relativeRecency' = 'newer'
    )
    OR v_result::text ~ '(supersedes|contradicts|edgeId|annotationChecks)' THEN
    RAISE EXCEPTION 'k5a_c3_atomic_top_k_failed:%', v_result;
  END IF;

  SELECT array_agg(id ORDER BY id) INTO v_exclusions
  FROM public.knowledge_units
  WHERE id NOT IN (v_suppressed_top, v_suppressed_low);
  v_suppressed := public.k5a_c3_selecting_read_poc(
    v_member, v_member, v_exclusions, 1, 8, 16, 4, 8, 512, 128
  );
  IF jsonb_array_length(v_suppressed->'claims') <> 1
    OR (v_suppressed->'claims'->0->>'knowledgeUnitId')::uuid
      IS DISTINCT FROM v_suppressed_top
    OR jsonb_array_length(v_suppressed->'claims'->0->'tensions') <> 0
    OR v_suppressed::text LIKE '%' || v_suppressed_low::text || '%'
    OR v_suppressed::text LIKE '%' || v_private_input::text || '%'
    OR (SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(v_suppressed) key)
      IS DISTINCT FROM ARRAY['claims','truncated']::text[] THEN
    RAISE EXCEPTION 'k5a_c3_suppressed_pair_signalled:%', v_suppressed;
  END IF;

  SELECT array_agg(id ORDER BY id) INTO v_exclusions
  FROM public.knowledge_units
  WHERE id NOT IN (
    (SELECT id FROM k5a_c3_units WHERE name = 'baseline-top'),
    (SELECT id FROM k5a_c3_units WHERE name = 'baseline-low')
  );
  v_baseline := public.k5a_c3_selecting_read_poc(
    v_member, v_member, v_exclusions, 1, 8, 16, 4, 8, 512, 128
  );
  IF jsonb_array_length(v_baseline->'claims') <> 1
    OR jsonb_array_length(v_baseline->'claims'->0->'tensions') <> 0
    OR v_baseline->>'truncated' IS DISTINCT FROM v_suppressed->>'truncated' THEN
    RAISE EXCEPTION 'k5a_c3_suppressed_pair_shape_failed:%:%',
      v_suppressed, v_baseline;
  END IF;

  SELECT array_agg(id ORDER BY id) INTO v_exclusions
  FROM public.knowledge_units
  WHERE id NOT IN (
    SELECT id FROM k5a_c3_units
    WHERE name = 'high-focus' OR name LIKE 'high-partner-%'
  );
  v_started := clock_timestamp();
  v_high_degree := public.k5a_c3_selecting_read_poc(
    v_member, v_member, v_exclusions, 1, 2, 16, 4, 8, 512, 128
  );
  IF v_high_degree->>'truncated' <> 'true'
    OR extract(epoch FROM clock_timestamp() - v_started) >= 0.55
    OR jsonb_array_length(v_high_degree->'claims') <> 3
    OR NOT (SELECT diagnostics.own_degree_truncated
      FROM k5a_c3_diagnostics diagnostics)
    OR (SELECT diagnostics.annotation_checks
      FROM k5a_c3_diagnostics diagnostics) > 16 THEN
    RAISE EXCEPTION 'k5a_c3_own_degree_overflow_failed:%', v_high_degree;
  END IF;

  SELECT array_agg(id ORDER BY id) INTO v_exclusions
  FROM public.knowledge_units
  WHERE id NOT IN (
    SELECT id FROM k5a_c3_units WHERE name LIKE 'chain-%'
  );
  v_chain_full := public.k5a_c3_selecting_read_poc(
    v_member, v_member, v_exclusions, 1, 4, 48, 8, 8, 512, 128
  );
  IF NOT ARRAY[v_chain_a, v_chain_b, v_chain_c, v_chain_d, v_chain_x] <@ ARRAY(
      SELECT (claim->>'knowledgeUnitId')::uuid
      FROM jsonb_array_elements(v_chain_full->'claims') claim
    )
    OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_chain_full->'claims') claim
      CROSS JOIN LATERAL jsonb_array_elements(claim->'tensions') tension
      WHERE (claim->>'knowledgeUnitId')::uuid = v_chain_c
        AND (tension->>'withUnitId')::uuid = v_chain_b
    ) THEN
    RAISE EXCEPTION 'k5a_c3_chain_closure_failed:%', v_chain_full;
  END IF;

  v_chain_priority := public.k5a_c3_selecting_read_poc(
    v_member, v_member, v_exclusions, 1, 4, 6, 4, 8, 512, 128
  );
  IF NOT ARRAY[v_chain_a, v_chain_b, v_chain_c] <@ ARRAY(
      SELECT (claim->>'knowledgeUnitId')::uuid
      FROM jsonb_array_elements(v_chain_priority->'claims') claim
    )
    OR v_chain_priority::text LIKE '%' || v_chain_x::text || '%'
    OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_chain_priority->'claims') claim
      CROSS JOIN LATERAL jsonb_array_elements(claim->'tensions') tension
      WHERE (claim->>'knowledgeUnitId')::uuid = v_chain_c
        AND (tension->>'withUnitId')::uuid = v_chain_b
    ) THEN
    RAISE EXCEPTION 'k5a_c3_supersedes_first_failed:%', v_chain_priority;
  END IF;

  v_chain_bounded := public.k5a_c3_selecting_read_poc(
    v_member, v_member, v_exclusions, 1, 4, 48, 1, 8, 512, 128
  );
  IF v_chain_bounded->>'truncated' <> 'true'
    OR v_chain_bounded::text LIKE '%' || v_chain_d::text || '%'
    OR NOT (SELECT diagnostics.closure_budget_truncated
      FROM k5a_c3_diagnostics diagnostics)
    OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_chain_bounded->'claims') claim
      CROSS JOIN LATERAL jsonb_array_elements(claim->'tensions') tension
      WHERE (claim->>'knowledgeUnitId')::uuid = v_chain_c
        AND (tension->>'withUnitId')::uuid = v_chain_b
    ) THEN
    RAISE EXCEPTION 'k5a_c3_chain_middle_degradation_failed:%', v_chain_bounded;
  END IF;

  -- Degree independence is measured at the amended annotation boundary. The
  -- same viewer seek runs before and after 128 foreign-person rows are added.
  ANALYZE public.knowledge_relation_annotation_index;
  EXECUTE format(
    'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '
    'SELECT partner_unit_id, edge_id, assertion_attempt_id, input_unit_ids '
    'FROM public.knowledge_relation_annotation_index '
    'WHERE endpoint_unit_id = %L::uuid AND assertion_person_id = %L::uuid '
    'ORDER BY repair_priority, assertion_recorded_at DESC, edge_id, assertion_attempt_id '
    'LIMIT 9', v_foreign_focus, v_member
  ) INTO v_plan_before;
  v_started := clock_timestamp();
  FOR i IN 1..50 LOOP
    PERFORM * FROM (
      SELECT partner_unit_id
      FROM public.knowledge_relation_annotation_index
      WHERE endpoint_unit_id = v_foreign_focus
        AND assertion_person_id = v_member
      ORDER BY repair_priority, assertion_recorded_at DESC,
        edge_id, assertion_attempt_id
      LIMIT 9
    ) own_rows;
  END LOOP;
  v_index_before_elapsed := extract(epoch FROM clock_timestamp() - v_started);

  SELECT array_agg(id ORDER BY id) INTO v_exclusions
  FROM public.knowledge_units WHERE id NOT IN (v_foreign_focus, v_foreign_own);
  PERFORM public.k5a_c3_selecting_read_poc(
    v_member, v_member, v_exclusions, 2, 8, 32, 8, 8, 512, 128
  );
  v_started := clock_timestamp();
  v_foreign_before := public.k5a_c3_selecting_read_poc(
    v_member, v_member, v_exclusions, 2, 8, 32, 8, 8, 512, 128
  );
  v_reader_before_elapsed := extract(epoch FROM clock_timestamp() - v_started);
  IF (SELECT diagnostics.claim_budget_truncated
      FROM k5a_c3_diagnostics diagnostics) THEN
    RAISE EXCEPTION 'k5a_c3_foreign_baseline_claim_truncated';
  END IF;

  FOR i IN 1..128 LOOP
    PERFORM public.k5a_c3_seed_relation_poc(
      v_foreign_own, v_foreign_focus, v_owner, 'supersedes', i
    );
  END LOOP;
  ANALYZE public.knowledge_relation_annotation_index;
  EXECUTE format(
    'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '
    'SELECT partner_unit_id, edge_id, assertion_attempt_id, input_unit_ids '
    'FROM public.knowledge_relation_annotation_index '
    'WHERE endpoint_unit_id = %L::uuid AND assertion_person_id = %L::uuid '
    'ORDER BY repair_priority, assertion_recorded_at DESC, edge_id, assertion_attempt_id '
    'LIMIT 9', v_foreign_focus, v_member
  ) INTO v_plan_after;
  v_started := clock_timestamp();
  FOR i IN 1..50 LOOP
    PERFORM * FROM (
      SELECT partner_unit_id
      FROM public.knowledge_relation_annotation_index
      WHERE endpoint_unit_id = v_foreign_focus
        AND assertion_person_id = v_member
      ORDER BY repair_priority, assertion_recorded_at DESC,
        edge_id, assertion_attempt_id
      LIMIT 9
    ) own_rows;
  END LOOP;
  v_index_after_elapsed := extract(epoch FROM clock_timestamp() - v_started);

  SELECT array_agg(id ORDER BY id) INTO v_exclusions
  FROM public.knowledge_units WHERE id NOT IN (v_foreign_focus, v_foreign_own);
  PERFORM public.k5a_c3_selecting_read_poc(
    v_member, v_member, v_exclusions, 2, 8, 32, 8, 8, 512, 128
  );
  v_started := clock_timestamp();
  v_foreign_after := public.k5a_c3_selecting_read_poc(
    v_member, v_member, v_exclusions, 2, 8, 32, 8, 8, 512, 128
  );
  v_reader_after_elapsed := extract(epoch FROM clock_timestamp() - v_started);
  IF (SELECT diagnostics.claim_budget_truncated
      FROM k5a_c3_diagnostics diagnostics) THEN
    RAISE EXCEPTION 'k5a_c3_foreign_pathological_claim_truncated';
  END IF;
  IF v_plan_before::text NOT LIKE '%knowledge_relation_annotation_own_lookup%'
    OR v_plan_after::text NOT LIKE '%knowledge_relation_annotation_own_lookup%'
    OR v_plan_before::text NOT LIKE '%"Index Cond":%'
    OR v_plan_after::text NOT LIKE '%"Index Cond":%'
    OR v_plan_before::text LIKE '%"Filter":%'
    OR v_plan_after::text LIKE '%"Filter":%'
    OR v_plan_before::text NOT LIKE '%' || v_foreign_focus::text || '%'
    OR v_plan_after::text NOT LIKE '%' || v_foreign_focus::text || '%'
    OR v_plan_before::text NOT LIKE '%' || v_member::text || '%'
    OR v_plan_after::text NOT LIKE '%' || v_member::text || '%'
    OR v_plan_before::text LIKE '%knowledge_relation_assertions%'
    OR v_plan_after::text LIKE '%knowledge_relation_assertions%'
    OR v_plan_before #>> '{0,Plan,Node Type}'
      IS DISTINCT FROM v_plan_after #>> '{0,Plan,Node Type}'
    OR v_plan_before #>> '{0,Plan,Plans,0,Node Type}'
      IS DISTINCT FROM v_plan_after #>> '{0,Plan,Plans,0,Node Type}'
    OR v_plan_before #>> '{0,Plan,Plans,0,Index Name}'
      IS DISTINCT FROM v_plan_after #>> '{0,Plan,Plans,0,Index Name}'
    OR v_plan_before #>> '{0,Plan,Plans,0,Index Cond}'
      IS DISTINCT FROM v_plan_after #>> '{0,Plan,Plans,0,Index Cond}'
    OR v_plan_before::text NOT LIKE '%"Actual Rows": 1%'
    OR v_plan_after::text NOT LIKE '%"Actual Rows": 1%'
    OR (SELECT count(*)
        FROM public.knowledge_relation_annotation_index annotation
        WHERE annotation.endpoint_unit_id = v_foreign_focus
          AND annotation.assertion_person_id = v_owner) <> 128
    OR (SELECT count(*)
        FROM public.knowledge_relation_annotation_index annotation
        WHERE annotation.endpoint_unit_id = v_foreign_focus
          AND annotation.assertion_person_id = v_member) <> 1
    OR abs(v_index_before_elapsed - v_index_after_elapsed) >= 0.2
    OR greatest(v_index_before_elapsed, v_index_after_elapsed) >= 0.55
    OR abs(v_reader_before_elapsed - v_reader_after_elapsed) >= 0.2
    OR greatest(v_reader_before_elapsed, v_reader_after_elapsed) >= 0.55 THEN
    RAISE EXCEPTION 'k5a_c3_foreign_degree_independence_failed:%:%:%:%:%:%',
      v_plan_before, v_plan_after,
      v_index_before_elapsed, v_index_after_elapsed,
      v_reader_before_elapsed, v_reader_after_elapsed;
  END IF;

  IF v_foreign_before->>'truncated' <> 'false'
    OR v_foreign_before IS DISTINCT FROM v_foreign_after THEN
    RAISE EXCEPTION 'k5a_c3_foreign_degree_output_changed:%:%',
      v_foreign_before, v_foreign_after;
  END IF;

  EXECUTE format(
    'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '
    'SELECT partner_unit_id, edge_id, assertion_attempt_id, input_unit_ids '
    'FROM public.knowledge_relation_annotation_index '
    'WHERE endpoint_unit_id = %L::uuid AND assertion_person_id = %L::uuid '
    'ORDER BY repair_priority, assertion_recorded_at DESC, edge_id, assertion_attempt_id '
    'LIMIT 9', v_suppressed_top, v_member
  ) INTO v_suppressed_plan;
  IF v_suppressed_plan::text NOT LIKE '%knowledge_relation_annotation_own_lookup%'
    OR v_suppressed_plan::text NOT LIKE '%"Index Cond":%'
    OR v_suppressed_plan::text LIKE '%"Filter":%'
    OR v_suppressed_plan::text NOT LIKE '%' || v_suppressed_top::text || '%'
    OR v_suppressed_plan::text NOT LIKE '%' || v_member::text || '%'
    OR v_suppressed_plan::text LIKE '%knowledge_relation_assertions%'
    OR v_suppressed_plan::text NOT LIKE '%"Actual Rows": 0%' THEN
    RAISE EXCEPTION 'k5a_c3_suppressed_pair_plan_failed:%', v_suppressed_plan;
  END IF;
END
$k5a_c3_assertions$;

REVOKE EXECUTE ON FUNCTION public.k5a_c3_selecting_read_poc(
  uuid, uuid, uuid[], integer, integer, integer, integer,
  integer, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.k5a_c3_selecting_read_poc(
  uuid, uuid, uuid[], integer, integer, integer, integer,
  integer, integer, integer
) TO service_role;

SELECT 'CARTOGRAPHER_K5A_C3_R3_POC_GREEN';
