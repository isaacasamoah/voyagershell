\set ON_ERROR_STOP on

-- Round 7 replays the complete unconstrained C3 behavior battery at realistic
-- scale. The dedicated shape-space battery derives and asserts each crossover;
-- this file keeps results/timing diagnostics separate from physical
-- design-integrity checks. The production v3 query remains untouched.
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
  v_design_integrity_before jsonb;
  v_design_integrity_after jsonb;
  v_foreign_before integer := 1001;
  v_foreign_after integer := 2002;
  v_baseline_p95 double precision[] := '{}';
  v_p95_mean_before double precision;
  v_p95_stddev double precision;
  v_timing_envelope double precision;
  v_p95_after double precision;
  i integer;
BEGIN
  SELECT id INTO STRICT v_focus FROM public.k5a_c3_units
  WHERE name = 'foreign-focus';
  SELECT id INTO STRICT v_own FROM public.k5a_c3_units
  WHERE name = 'foreign-own';

  FOR i IN 129..v_foreign_before LOOP
    PERFORM public.k5a_c3_seed_relation_poc(
      v_own, v_focus, v_owner, 'supersedes', i
    );
  END LOOP;
  ANALYZE public.knowledge_relation_annotation_index;
  v_behavior_before := public.k5a_c3_assert_behavior_poc('realistic');
  v_result_before := public.k5a_c3_foreign_focus_result_poc();
  v_plan := public.k5a_c3_annotation_plan_poc(v_focus, v_member);
  v_design_integrity_before :=
    public.k5a_c3_annotation_design_integrity_poc(v_plan);
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
  v_design_integrity_after :=
    public.k5a_c3_annotation_design_integrity_poc(v_plan);
  v_p95_after := public.k5a_c3_measure_reader_p95_poc(v_result_after);

  IF v_result_before IS DISTINCT FROM v_result_after
    OR v_behavior_before - 'suppressed_design_integrity'
      IS DISTINCT FROM v_behavior_after - 'suppressed_design_integrity'
    OR NOT (v_design_integrity_before->'index_names'
      ? 'knowledge_relation_annotation_own_lookup')
    OR NOT (v_design_integrity_after->'index_names'
      ? 'knowledge_relation_annotation_own_lookup')
    OR (v_design_integrity_before->>'rows_removed_by_filter')::bigint <> 0
    OR (v_design_integrity_after->>'rows_removed_by_filter')::bigint <> 0
    OR (v_design_integrity_before->>'rows_read')::bigint <> 1
    OR v_design_integrity_before->'rows_read'
      IS DISTINCT FROM v_design_integrity_after->'rows_read'
    OR (SELECT count(*)
        FROM public.knowledge_relation_annotation_index annotation
        WHERE annotation.endpoint_unit_id = v_focus
          AND annotation.assertion_person_id = v_owner) <> v_foreign_after
    OR (SELECT count(*)
        FROM public.knowledge_relation_annotation_index annotation
        WHERE annotation.endpoint_unit_id = v_focus
          AND annotation.assertion_person_id = v_member) <> 1 THEN
    RAISE EXCEPTION 'k5a_c3_r7_realistic_observable_or_integrity_failed:%:%:%:%:%:%:%',
      v_behavior_before, v_behavior_after,
      v_design_integrity_before, v_design_integrity_after,
      v_baseline_p95, v_p95_after, v_timing_envelope;
  END IF;

  RAISE NOTICE 'K5A_C3_R7_REALISTIC:%', jsonb_build_object(
    'foreign_assertions_before', v_foreign_before,
    'foreign_assertions_after', v_foreign_after,
    'design_integrity_before', v_design_integrity_before,
    'design_integrity_after', v_design_integrity_after,
    'reader_baseline_p95_ms', to_jsonb(v_baseline_p95),
    'reader_p95_mean_before_growth', round(v_p95_mean_before::numeric, 3),
    'reader_p95_ms_after_growth', round(v_p95_after::numeric, 3),
    'database_timing_diagnostic_3sigma_ms',
      round(v_timing_envelope::numeric, 3),
    'database_timing_diagnostic_inside_envelope',
      abs(v_p95_mean_before - v_p95_after) <= v_timing_envelope,
    'observable_boundary_timing_status', 'pending_confirmed_floor_minus_overhead'
  );
END
$k5a_c3_realistic_regime$;

SELECT 'CARTOGRAPHER_K5A_C3_R7_REALISTIC_GREEN';
