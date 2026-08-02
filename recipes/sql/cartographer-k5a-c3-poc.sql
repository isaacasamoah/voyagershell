\set ON_ERROR_STOP on

-- K5a C3 is deliberately a disposable-only proof. The production v3 read is
-- migration 079; this function exists only inside the no-network battery so
-- the selecting mechanism is observed before that read is built.
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
  v_claim record;
  v_edge record;
  v_assertion record;
  v_partner_count integer;
  v_partner_visible boolean;
  v_checks_needed integer;
  v_claims jsonb;
BEGIN
  IF p_root_authority_id IS NULL OR p_viewer_profile_id IS NULL
    OR p_exclude_unit_ids IS NULL
    OR p_claim_budget IS NULL OR p_claim_budget NOT BETWEEN 1 AND 64
    OR p_per_claim_partner_cap IS NULL
      OR p_per_claim_partner_cap NOT BETWEEN 1 AND 16
    OR p_annotation_check_budget IS NULL
      OR p_annotation_check_budget NOT BETWEEN 1 AND (p_claim_budget * 16)
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
  CREATE TEMP TABLE IF NOT EXISTS k5a_c3_checked_edges (
    edge_id uuid PRIMARY KEY
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS k5a_c3_annotations (
    unit_id uuid NOT NULL,
    partner_unit_id uuid NOT NULL,
    relative_recency text NOT NULL CHECK (relative_recency IN ('newer', 'older', 'same')),
    PRIMARY KEY (unit_id, partner_unit_id)
  ) ON COMMIT DROP;
  TRUNCATE k5a_c3_annotations, k5a_c3_checked_edges,
    k5a_c3_selected, k5a_c3_candidates;

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
  IF v_candidate_count > p_claim_budget THEN v_truncated := true; END IF;
  INSERT INTO k5a_c3_selected(unit_id, selected_rank, promoted)
  SELECT unit_id, initial_rank, false
  FROM k5a_c3_candidates
  WHERE initial_rank <= p_claim_budget;

  -- The loop begins only after the walk and top-K selection are complete.
  -- It inspects a bounded, constant-shaped assertion input list before either
  -- annotating or promoting, so a suppressed assertion changes neither result.
  FOR v_claim IN
    SELECT selected.unit_id, selected.selected_rank
    FROM k5a_c3_selected selected
    ORDER BY selected.selected_rank, selected.unit_id
  LOOP
    SELECT count(*) INTO v_partner_count
    FROM public.graph_edges edge
    JOIN public.graph_nodes source_node ON source_node.id = edge.source_node_id
    JOIN public.graph_nodes target_node ON target_node.id = edge.target_node_id
    WHERE edge.kind IN ('contradicts', 'supersedes')
      AND (
        (source_node.kind = 'knowledge_unit'
          AND source_node.authority_id = v_claim.unit_id)
        OR (target_node.kind = 'knowledge_unit'
          AND target_node.authority_id = v_claim.unit_id)
      )
      AND EXISTS (
        SELECT 1 FROM k5a_c3_candidates candidate
        WHERE candidate.unit_id = CASE
          WHEN source_node.authority_id = v_claim.unit_id
            THEN target_node.authority_id
          ELSE source_node.authority_id END
      );
    IF v_partner_count > p_per_claim_partner_cap THEN v_truncated := true; END IF;

    FOR v_edge IN
      SELECT edge.id,
        CASE WHEN source_node.authority_id = v_claim.unit_id
          THEN target_node.authority_id ELSE source_node.authority_id END AS partner_id
      FROM public.graph_edges edge
      JOIN public.graph_nodes source_node ON source_node.id = edge.source_node_id
      JOIN public.graph_nodes target_node ON target_node.id = edge.target_node_id
      WHERE edge.kind IN ('contradicts', 'supersedes')
        AND (
          (source_node.kind = 'knowledge_unit'
            AND source_node.authority_id = v_claim.unit_id)
          OR (target_node.kind = 'knowledge_unit'
            AND target_node.authority_id = v_claim.unit_id)
        )
        AND EXISTS (
          SELECT 1 FROM k5a_c3_candidates candidate
          WHERE candidate.unit_id = CASE
            WHEN source_node.authority_id = v_claim.unit_id
              THEN target_node.authority_id
            ELSE source_node.authority_id END
        )
      ORDER BY edge.id
      LIMIT p_per_claim_partner_cap
    LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM k5a_c3_checked_edges checked
        WHERE checked.edge_id = v_edge.id
      );
      INSERT INTO k5a_c3_checked_edges(edge_id) VALUES (v_edge.id);
      v_partner_visible := false;
      FOR v_assertion IN
        SELECT assertion.input_unit_ids
        FROM public.knowledge_relation_assertions assertion
        WHERE assertion.edge_id = v_edge.id
        ORDER BY assertion.recorded_at, assertion.attempt_id
      LOOP
        v_checks_needed := cardinality(v_assertion.input_unit_ids);
        IF v_annotation_checks + v_checks_needed > p_annotation_check_budget THEN
          v_truncated := true;
          EXIT;
        END IF;
        v_annotation_checks := v_annotation_checks + v_checks_needed;
        v_partner_visible := NOT EXISTS (
          SELECT 1
          FROM unnest(v_assertion.input_unit_ids) input_unit_id
          WHERE NOT EXISTS (
            SELECT 1
            FROM public.graph_nodes input_node
            WHERE input_node.kind = 'knowledge_unit'
              AND input_node.authority_id = input_unit_id
              AND public.viewer_has_graph_node_grant(
                input_node.id, p_viewer_profile_id
              )
          )
        );
        EXIT WHEN v_partner_visible;
      END LOOP;
      IF v_partner_visible THEN
        INSERT INTO k5a_c3_selected(unit_id, selected_rank, promoted)
        VALUES (v_edge.partner_id, v_claim.selected_rank, true)
        ON CONFLICT (unit_id) DO UPDATE
          SET selected_rank = least(
            k5a_c3_selected.selected_rank, EXCLUDED.selected_rank
          );
        INSERT INTO k5a_c3_annotations(
          unit_id, partner_unit_id, relative_recency
        )
        SELECT v_claim.unit_id, v_edge.partner_id,
          CASE WHEN own.source_sequence_num > partner.source_sequence_num THEN 'newer'
            WHEN own.source_sequence_num < partner.source_sequence_num THEN 'older'
            ELSE 'same' END
        FROM k5a_c3_candidates own, k5a_c3_candidates partner
        WHERE own.unit_id = v_claim.unit_id
          AND partner.unit_id = v_edge.partner_id
        ON CONFLICT DO NOTHING;
        INSERT INTO k5a_c3_annotations(
          unit_id, partner_unit_id, relative_recency
        )
        SELECT v_edge.partner_id, v_claim.unit_id,
          CASE WHEN partner.source_sequence_num > own.source_sequence_num THEN 'newer'
            WHEN partner.source_sequence_num < own.source_sequence_num THEN 'older'
            ELSE 'same' END
        FROM k5a_c3_candidates own, k5a_c3_candidates partner
        WHERE own.unit_id = v_claim.unit_id
          AND partner.unit_id = v_edge.partner_id
        ON CONFLICT DO NOTHING;
      END IF;
      EXIT WHEN v_annotation_checks >= p_annotation_check_budget;
    END LOOP;
    EXIT WHEN v_annotation_checks >= p_annotation_check_budget;
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
  v_unit uuid := md5(format('k5a-c3-poc-unit:%s', p_key))::uuid;
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
  p_focus_unit_id uuid,
  p_target_unit_id uuid,
  p_private_input_unit_id uuid,
  p_attempt_number integer
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
  v_owner uuid := '72000000-0000-4000-8000-000000000001';
  v_attempt uuid := md5(format(
    'k5a-c3-poc-attempt:%s:%s:%s',
    p_focus_unit_id, p_target_unit_id, p_attempt_number
  ))::uuid;
  v_lease uuid := md5(format('k5a-c3-poc-lease:%s', v_attempt))::uuid;
  v_source_node uuid := public.canonical_graph_node_id(
    'knowledge_unit', p_focus_unit_id
  );
  v_target_node uuid := public.canonical_graph_node_id(
    'knowledge_unit', p_target_unit_id
  );
  v_edge uuid;
  v_inputs uuid[] := ARRAY[p_focus_unit_id, p_target_unit_id];
BEGIN
  IF p_private_input_unit_id IS NOT NULL THEN
    v_inputs := v_inputs || p_private_input_unit_id;
  END IF;
  INSERT INTO public.knowledge_relation_attempts(
    id, unit_id, person_id, contract_version, attempt_number,
    candidate_unit_ids, model_provider, model_id, resolver_label, lease_token
  ) VALUES (
    v_attempt, p_focus_unit_id, v_owner, 'relation-conflict-v2',
    p_attempt_number, ARRAY[p_target_unit_id], 'proof', 'c3-poc',
    'seeded-corpus', v_lease
  );
  v_edge := public.canonical_graph_edge_id(
    v_source_node, 'supersedes', v_target_node
  );
  INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)
  VALUES (v_edge, v_source_node, v_target_node, 'supersedes');
  INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)
  SELECT v_edge, source_event_id
  FROM public.knowledge_units
  WHERE id IN (p_focus_unit_id, p_target_unit_id);
  INSERT INTO public.knowledge_relation_assertions(
    edge_id, input_unit_ids, contract_version, attempt_id
  ) VALUES (v_edge, v_inputs, 'relation-conflict-v2', v_attempt);
  RETURN v_edge;
END
$$;

CREATE TEMP TABLE k5a_c3_units(name text PRIMARY KEY, id uuid NOT NULL);
DO $k5a_c3_seed$
DECLARE
  v_member uuid := '72000000-0000-4000-8000-000000000002';
  v_stale uuid;
  v_correction uuid;
  v_fresh uuid;
  v_suppressed_top uuid;
  v_suppressed_low uuid;
  v_private_input uuid;
  v_standing uuid;
  v_old uuid;
  v_high_focus uuid;
  v_high_partner uuid;
  i integer;
BEGIN
  INSERT INTO k5a_c3_units VALUES
    ('stale', public.k5a_c3_seed_unit_poc(
      'k5a-stale', 'The delivery window still closes at 5pm.', 0.95,
      'operational', true)),
    ('fresh', public.k5a_c3_seed_unit_poc(
      'k5a-fresh', 'The new permit was approved this morning.', 0.90,
      'operational', true)),
    ('suppressed-top', public.k5a_c3_seed_unit_poc(
      'k5a-suppressed-top', 'The rehearsal starts at six.', 0.85,
      'operational', true)),
    ('correction', public.k5a_c3_seed_unit_poc(
      'k5a-correction', 'The delivery window now closes at 3pm.', 0.20,
      'operational', true)),
    ('suppressed-low', public.k5a_c3_seed_unit_poc(
      'k5a-suppressed-low', 'The private schedule moved rehearsal to eight.',
      0.10, 'operational', true)),
    ('private-input', public.k5a_c3_seed_unit_poc(
      'k5a-private-input', 'The director privately requested a later start.',
      0.70, 'operational', false)),
    ('standing', public.k5a_c3_seed_unit_poc(
      'k5a-standing', 'Always show temperatures in Celsius.', 0.99,
      'preference', true)),
    ('baseline-top', public.k5a_c3_seed_unit_poc(
      'k5a-baseline-top', 'The baseline rehearsal starts at six.', 0.85,
      'operational', true)),
    ('baseline-low', public.k5a_c3_seed_unit_poc(
      'k5a-baseline-low', 'The baseline rehearsal may start at eight.', 0.10,
      'operational', true)),
    ('old-standing', public.k5a_c3_seed_unit_poc(
      'k5a-old-standing', 'The older planning note remains tentative.', 0.60,
      'operational', true)),
    ('high-focus', public.k5a_c3_seed_unit_poc(
      'k5a-high-focus', 'The high-degree focus changed.', 0.92,
      'operational', true));
  SELECT id INTO STRICT v_stale FROM k5a_c3_units WHERE name = 'stale';
  SELECT id INTO STRICT v_fresh FROM k5a_c3_units WHERE name = 'fresh';
  SELECT id INTO STRICT v_correction FROM k5a_c3_units WHERE name = 'correction';
  SELECT id INTO STRICT v_suppressed_top FROM k5a_c3_units
    WHERE name = 'suppressed-top';
  SELECT id INTO STRICT v_suppressed_low FROM k5a_c3_units
    WHERE name = 'suppressed-low';
  SELECT id INTO STRICT v_private_input FROM k5a_c3_units
    WHERE name = 'private-input';
  SELECT id INTO STRICT v_standing FROM k5a_c3_units WHERE name = 'standing';
  SELECT id INTO STRICT v_old FROM k5a_c3_units WHERE name = 'old-standing';
  SELECT id INTO STRICT v_high_focus FROM k5a_c3_units WHERE name = 'high-focus';

  PERFORM public.k5a_c3_seed_relation_poc(v_correction, v_stale, NULL, 1);
  PERFORM public.k5a_c3_seed_relation_poc(
    v_suppressed_low, v_suppressed_top, v_private_input, 1
  );
  FOR i IN 1..8 LOOP
    v_high_partner := public.k5a_c3_seed_unit_poc(
      format('k5a-high-partner-%s', i),
      format('High-degree partner %s.', i),
      0.05 + (i * 0.001), 'operational', true
    );
    INSERT INTO k5a_c3_units VALUES (format('high-partner-%s', i), v_high_partner);
    PERFORM public.k5a_c3_seed_relation_poc(
      v_high_focus, v_high_partner, NULL, i
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
  v_member uuid := '72000000-0000-4000-8000-000000000002';
  v_result jsonb;
  v_suppressed jsonb;
  v_baseline jsonb;
  v_high_degree jsonb;
  v_exclusions uuid[];
  v_stale uuid;
  v_fresh uuid;
  v_correction uuid;
  v_suppressed_top uuid;
  v_suppressed_low uuid;
  v_private_input uuid;
  v_standing uuid;
  v_started timestamptz;
  v_suppressed_elapsed double precision;
  v_baseline_elapsed double precision;
BEGIN
  SELECT id INTO STRICT v_stale FROM k5a_c3_units WHERE name = 'stale';
  SELECT id INTO STRICT v_fresh FROM k5a_c3_units WHERE name = 'fresh';
  SELECT id INTO STRICT v_correction FROM k5a_c3_units WHERE name = 'correction';
  SELECT id INTO STRICT v_suppressed_top FROM k5a_c3_units
    WHERE name = 'suppressed-top';
  SELECT id INTO STRICT v_suppressed_low FROM k5a_c3_units
    WHERE name = 'suppressed-low';
  SELECT id INTO STRICT v_private_input FROM k5a_c3_units
    WHERE name = 'private-input';
  SELECT id INTO STRICT v_standing FROM k5a_c3_units WHERE name = 'standing';
  SELECT array_agg(id ORDER BY id) INTO v_exclusions
  FROM k5a_c3_units WHERE name = 'standing' OR name LIKE 'high-%';

  v_result := public.k5a_c3_selecting_read_poc(
    v_member, v_member, v_exclusions, 3, 8, 48, 8, 512, 128
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
        v_suppressed_low, v_private_input, v_standing
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
  v_started := clock_timestamp();
  v_suppressed := public.k5a_c3_selecting_read_poc(
    v_member, v_member, v_exclusions, 1, 8, 16, 8, 512, 128
  );
  v_suppressed_elapsed := extract(epoch FROM clock_timestamp() - v_started);
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
  v_started := clock_timestamp();
  v_baseline := public.k5a_c3_selecting_read_poc(
    v_member, v_member, v_exclusions, 1, 8, 16, 8, 512, 128
  );
  v_baseline_elapsed := extract(epoch FROM clock_timestamp() - v_started);
  IF jsonb_array_length(v_baseline->'claims') <> 1
    OR jsonb_array_length(v_baseline->'claims'->0->'tensions') <> 0
    OR v_baseline->>'truncated' IS DISTINCT FROM v_suppressed->>'truncated'
    OR abs(v_suppressed_elapsed - v_baseline_elapsed) >= 0.2
    OR greatest(v_suppressed_elapsed, v_baseline_elapsed) >= 0.55 THEN
    RAISE EXCEPTION 'k5a_c3_suppressed_pair_shape_or_floor_failed:%:%:%:%',
      v_suppressed, v_baseline, v_suppressed_elapsed, v_baseline_elapsed;
  END IF;

  SELECT array_agg(id ORDER BY id) INTO v_exclusions
  FROM public.knowledge_units
  WHERE id NOT IN (
    SELECT id FROM k5a_c3_units WHERE name = 'high-focus' OR name LIKE 'high-partner-%'
  );
  v_started := clock_timestamp();
  v_high_degree := public.k5a_c3_selecting_read_poc(
    v_member, v_member, v_exclusions, 1, 2, 4, 8, 512, 128
  );
  IF v_high_degree->>'truncated' <> 'true'
    OR extract(epoch FROM clock_timestamp() - v_started) >= 0.55
    OR jsonb_array_length(v_high_degree->'claims') > 3 THEN
    RAISE EXCEPTION 'k5a_c3_annotation_budget_failed:%', v_high_degree;
  END IF;
END
$k5a_c3_assertions$;

REVOKE EXECUTE ON FUNCTION public.k5a_c3_selecting_read_poc(
  uuid, uuid, uuid[], integer, integer, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.k5a_c3_selecting_read_poc(
  uuid, uuid, uuid[], integer, integer, integer, integer, integer, integer
) TO service_role;

SELECT 'CARTOGRAPHER_K5A_C3_POC_GREEN';
