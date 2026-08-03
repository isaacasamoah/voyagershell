\set ON_ERROR_STOP on

-- The C5 type bar is asymmetric because a domain claim mistyped operational
-- stays above zero. Prove that the selecting read remains useful under that
-- recoverable error: the reached claim still arrives, but does not outrank a
-- fresher claim with higher birth attention.
BEGIN;

DO $k5a_c3_v5_type_dynamics$
DECLARE
  v_member uuid := '72000000-0000-4000-8000-000000000002';
  v_mistyped uuid;
  v_fresh uuid;
  v_mistyped_event uuid;
  v_fresh_event uuid;
  v_mistyped_created_at timestamptz;
  v_fresh_created_at timestamptz;
  v_between timestamptz;
  v_exclusions uuid[];
  v_result jsonb;
  i integer;
BEGIN
  v_mistyped := public.k5a_c3_seed_unit_poc(
    'v5-mistyped-domain',
    'Mara owns the billing reconciliation service.',
    0.60, 'operational', true
  );
  v_fresh := public.k5a_c3_seed_unit_poc(
    'v5-fresh-higher-birth',
    'The reconciliation service publishes a daily balance report.',
    0.90, 'domain', true
  );

  SELECT unit.source_event_id INTO STRICT v_mistyped_event
  FROM public.knowledge_units unit
  WHERE unit.id = v_mistyped;
  SELECT unit.source_event_id INTO STRICT v_fresh_event
  FROM public.knowledge_units unit
  WHERE unit.id = v_fresh;

  -- knowledge_events.created_at defaults to transaction_timestamp(), so two
  -- ingress calls in this proof transaction are intentionally equal. Give the
  -- disposable fixture an explicit chronology while the source-immutability
  -- trigger is disabled, then restore the trigger before exercising any
  -- product function. The enclosing rollback removes both fixture writes.
  v_fresh_created_at := clock_timestamp();
  v_mistyped_created_at := v_fresh_created_at - interval '1 second';
  ALTER TABLE public.knowledge_events
    DISABLE TRIGGER trg_knowledge_event_source_immutable;
  UPDATE public.knowledge_events
  SET created_at = CASE id
    WHEN v_mistyped_event THEN v_mistyped_created_at
    WHEN v_fresh_event THEN v_fresh_created_at
  END
  WHERE id IN (v_mistyped_event, v_fresh_event);
  ALTER TABLE public.knowledge_events
    ENABLE TRIGGER trg_knowledge_event_source_immutable;
  IF v_fresh_created_at <= v_mistyped_created_at THEN
    RAISE EXCEPTION 'k5a_c3_v5_fixture_clock_not_ordered';
  END IF;
  v_between := v_mistyped_created_at
    + ((v_fresh_created_at - v_mistyped_created_at) / 2);

  DELETE FROM public.session_index WHERE user_id = v_member;
  FOR i IN 1..8 LOOP
    INSERT INTO public.session_index(session_id, user_id, started_at, event_count)
    VALUES (format('k5a-v5-dynamics-%s', i), v_member, v_between, 1);
  END LOOP;

  IF public.knowledge_unit_session_distance(v_mistyped, v_member) <> 8
    OR public.knowledge_unit_session_distance(v_fresh, v_member) <> 0
    OR public.knowledge_unit_effective_attention(v_mistyped, v_member)
      IS DISTINCT FROM 0.18::real
    OR public.calculate_knowledge_unit_effective_attention(
      0.60, 'domain', 8, 0, false
    ) <> 0 THEN
    RAISE EXCEPTION 'k5a_c3_v5_type_dynamics_fixture_invalid';
  END IF;

  SELECT array_agg(id ORDER BY id) INTO v_exclusions
  FROM public.knowledge_units WHERE id NOT IN (v_mistyped, v_fresh);
  v_result := public.retrieve_knowledge_graph_claims_v3(
    v_member, v_member, v_exclusions, 3, 8, 16, 4, 8, 512, 128
  );

  IF jsonb_array_length(v_result->'claims') <> 2
    OR (v_result->'claims'->0->>'knowledgeUnitId')::uuid IS DISTINCT FROM v_fresh
    OR (v_result->'claims'->1->>'knowledgeUnitId')::uuid
      IS DISTINCT FROM v_mistyped
    OR (v_result->'claims'->1->>'knowledgeType') <> 'operational'
    OR (v_result->'claims'->1->>'attentionScore')::real
      IS DISTINCT FROM 0.18::real THEN
    RAISE EXCEPTION 'k5a_c3_v5_recoverable_type_error_ranking_failed:%', v_result;
  END IF;
END
$k5a_c3_v5_type_dynamics$;

ROLLBACK;
SELECT 'CARTOGRAPHER_K5A_C3_V5_DYNAMICS_GREEN';
