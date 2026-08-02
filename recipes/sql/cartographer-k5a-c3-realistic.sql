\set ON_ERROR_STOP on

-- Round 6 grows the already-proved small relation through its named page
-- budget, then replays the complete unconstrained C3 behavior battery above
-- the crossover. The production v3 query is deliberately untouched.
DO $k5a_c3_realistic_regime$
DECLARE
  v_owner uuid := '72000000-0000-4000-8000-000000000001';
  v_member uuid := '72000000-0000-4000-8000-000000000002';
  v_focus uuid;
  v_own uuid;
  v_behavior_before jsonb;
  v_behavior_after jsonb;
  v_result_before jsonb;
  v_result_after jsonb;
  v_plan jsonb;
  v_mechanism jsonb;
  v_mechanism_before jsonb;
  v_mechanism_after jsonb;
  v_response_floor_ms double precision;
  v_page_budget integer;
  v_crossover_pages integer;
  v_crossover_foreign_assertions integer;
  v_next_attempt integer := 129;
  v_foreign_before integer := 1001;
  v_foreign_after integer := 2002;
  v_baseline_p95 double precision[] := '{}';
  v_p95_mean_before double precision;
  v_p95_stddev double precision;
  v_timing_envelope double precision;
  v_p95_after double precision;
  i integer;
  j integer;
BEGIN
  SELECT response_floor_ms, small_relation_page_budget
  INTO STRICT v_response_floor_ms, v_page_budget
  FROM public.k5a_c3_runtime_config;
  SELECT id INTO STRICT v_focus FROM public.k5a_c3_units
  WHERE name = 'foreign-focus';
  SELECT id INTO STRICT v_own FROM public.k5a_c3_units
  WHERE name = 'foreign-own';

  -- Cross the named bound in small batches. The first observed plan after the
  -- relation exceeds the bound must already be the own-person index path.
  LOOP
    FOR j IN 1..8 LOOP
      PERFORM public.k5a_c3_seed_relation_poc(
        v_own, v_focus, v_owner, 'supersedes', v_next_attempt
      );
      v_next_attempt := v_next_attempt + 1;
    END LOOP;
    ANALYZE public.knowledge_relation_annotation_index;
    v_plan := public.k5a_c3_annotation_plan_poc(v_focus, v_member);
    v_mechanism := public.k5a_c3_annotation_mechanism_poc(v_plan);
    EXIT WHEN (v_mechanism->>'relation_pages')::integer > v_page_budget;
    IF v_next_attempt > v_foreign_before THEN
      RAISE EXCEPTION 'k5a_c3_r6_page_budget_not_crossed:%:%',
        v_page_budget, v_mechanism;
    END IF;
  END LOOP;
  v_crossover_pages := (v_mechanism->>'relation_pages')::integer;
  v_crossover_foreign_assertions := v_next_attempt - 1;
  IF NOT (v_mechanism->'index_names'
      ? 'knowledge_relation_annotation_own_lookup')
    OR (v_mechanism->>'rows_removed_by_filter')::bigint <> 0
    OR (v_mechanism->>'rows_read')::bigint <> 1 THEN
    RAISE EXCEPTION 'k5a_c3_r6_crossover_failed:%:%:%:%',
      v_page_budget, v_crossover_pages,
      v_crossover_foreign_assertions, v_mechanism;
  END IF;

  FOR i IN v_next_attempt..v_foreign_before LOOP
    PERFORM public.k5a_c3_seed_relation_poc(
      v_own, v_focus, v_owner, 'supersedes', i
    );
  END LOOP;
  ANALYZE public.knowledge_relation_annotation_index;
  v_behavior_before := public.k5a_c3_assert_behavior_poc('realistic');
  v_result_before := public.k5a_c3_foreign_focus_result_poc();
  v_plan := public.k5a_c3_annotation_plan_poc(v_focus, v_member);
  v_mechanism_before := public.k5a_c3_annotation_mechanism_poc(v_plan);
  FOR i IN 1..5 LOOP
    v_baseline_p95 := array_append(
      v_baseline_p95,
      public.k5a_c3_measure_reader_p95_poc(v_result_before)
    );
  END LOOP;
  SELECT avg(sample), coalesce(stddev_samp(sample), 0)
  INTO v_p95_mean_before, v_p95_stddev
  FROM unnest(v_baseline_p95) sample;
  v_timing_envelope := 3 * v_p95_stddev;

  FOR i IN (v_foreign_before + 1)..v_foreign_after LOOP
    PERFORM public.k5a_c3_seed_relation_poc(
      v_own, v_focus, v_owner, 'supersedes', i
    );
  END LOOP;
  ANALYZE public.knowledge_relation_annotation_index;
  v_behavior_after := public.k5a_c3_assert_behavior_poc('realistic');
  v_result_after := public.k5a_c3_foreign_focus_result_poc();
  v_plan := public.k5a_c3_annotation_plan_poc(v_focus, v_member);
  v_mechanism_after := public.k5a_c3_annotation_mechanism_poc(v_plan);
  v_p95_after := public.k5a_c3_measure_reader_p95_poc(v_result_after);

  IF v_result_before IS DISTINCT FROM v_result_after
    OR v_behavior_before - 'suppressed_mechanism'
      IS DISTINCT FROM v_behavior_after - 'suppressed_mechanism'
    OR NOT (v_mechanism_before->'index_names'
      ? 'knowledge_relation_annotation_own_lookup')
    OR NOT (v_mechanism_after->'index_names'
      ? 'knowledge_relation_annotation_own_lookup')
    OR (v_mechanism_before->>'rows_removed_by_filter')::bigint <> 0
    OR (v_mechanism_after->>'rows_removed_by_filter')::bigint <> 0
    OR (v_mechanism_before->>'rows_read')::bigint <> 1
    OR v_mechanism_before->'rows_read'
      IS DISTINCT FROM v_mechanism_after->'rows_read'
    OR abs(v_p95_mean_before - v_p95_after) > v_timing_envelope
    OR (SELECT count(*)
        FROM public.knowledge_relation_annotation_index annotation
        WHERE annotation.endpoint_unit_id = v_focus
          AND annotation.assertion_person_id = v_owner) <> v_foreign_after
    OR (SELECT count(*)
        FROM public.knowledge_relation_annotation_index annotation
        WHERE annotation.endpoint_unit_id = v_focus
          AND annotation.assertion_person_id = v_member) <> 1 THEN
    RAISE EXCEPTION 'k5a_c3_r6_realistic_regime_failed:%:%:%:%:%:%:%:%',
      v_behavior_before, v_behavior_after,
      v_mechanism_before, v_mechanism_after,
      v_baseline_p95, v_p95_after, v_timing_envelope, v_response_floor_ms;
  END IF;

  RAISE NOTICE 'K5A_C3_R6_REALISTIC:%', jsonb_build_object(
    'page_budget', v_page_budget,
    'first_pages_above_budget', v_crossover_pages,
    'foreign_assertions_at_first_pages_above_budget',
      v_crossover_foreign_assertions,
    'foreign_assertions_before', v_foreign_before,
    'foreign_assertions_after', v_foreign_after,
    'mechanism_before', v_mechanism_before,
    'mechanism_after', v_mechanism_after,
    'reader_baseline_p95_ms', to_jsonb(v_baseline_p95),
    'reader_p95_mean_before_growth', round(v_p95_mean_before::numeric, 3),
    'reader_p95_ms_after_growth', round(v_p95_after::numeric, 3),
    'timing_envelope_3sigma_ms', round(v_timing_envelope::numeric, 3),
    'response_floor_ms_from_boundary_source', v_response_floor_ms
  );
END
$k5a_c3_realistic_regime$;

SELECT 'CARTOGRAPHER_K5A_C3_R6_REALISTIC_GREEN';
