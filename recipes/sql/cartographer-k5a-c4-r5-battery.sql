DO $k5a_c4_r5$
DECLARE
  v_owner uuid := '72000000-0000-4000-8000-000000000001';
  v_member uuid := '72000000-0000-4000-8000-000000000002';
  v_query vector(1536) :=
    (array_fill(0::real, ARRAY[1534]) || ARRAY[1::real, 0::real])::vector;
  v_owner_target uuid := md5(format(
    'k5a-c4-r5-unit:%s:%s:%s', v_owner, 'owner-target', 1
  ))::uuid;
  v_member_target uuid := md5(format(
    'k5a-c4-r5-unit:%s:%s:%s', v_member, 'member-target', 1
  ))::uuid;
  v_missing integer;
  v_plan_100 jsonb;
  v_plan_1001 jsonb;
  v_plan_curve_probe jsonb;
  v_plan_owner_before jsonb;
  v_plan_owner_after jsonb;
  v_design_integrity_100 jsonb;
  v_design_integrity_1001 jsonb;
  v_design_integrity_curve_probe jsonb;
  v_owner_design_integrity_before jsonb;
  v_owner_design_integrity_after jsonb;
  v_owner_result_before jsonb;
  v_owner_result_after jsonb;
  v_p95_100 double precision;
  v_p95_1001 double precision;
  v_p95_curve_probe double precision;
  v_owner_p95_before double precision;
  v_owner_p95_after double precision;
  v_owner_baseline_p95 double precision[] := '{}';
  v_owner_p95_stddev double precision;
  v_timing_envelope double precision;
  v_curve_probe_units constant integer := 1500;
  v_foreign_before integer;
  v_foreign_after integer;
  i integer;
BEGIN
  -- Enough nonmatching audience rows make membership lookup a real planner
  -- choice rather than a tiny-table artifact.
  INSERT INTO auth.users(id, email, raw_user_meta_data, created_at)
  SELECT md5(format('k5a-c4-r5-noise-profile:%s', series))::uuid,
    format('k5a-c4-r5-noise-%s@example.invalid', series),
    jsonb_build_object('display_name', format('R5 noise %s', series)),
    clock_timestamp()
  FROM generate_series(1, 8192) series
  ON CONFLICT DO NOTHING;

  INSERT INTO auth.users(id, email, raw_user_meta_data, created_at)
  VALUES (
    '72000000-0000-4000-8000-000000000003',
    'k5a-c4-r5-backdrop@example.invalid',
    '{"display_name":"R5 planner backdrop"}'::jsonb,
    clock_timestamp()
  ) ON CONFLICT DO NOTHING;
  PERFORM public.k5a_c4_seed_foreign_backdrop(
    '72000000-0000-4000-8000-000000000003', 20000
  );
  ANALYZE public.knowledge_audiences;
  ANALYZE public.knowledge_units;
  ANALYZE public.knowledge_events;

  PERFORM public.k5a_c4_seed_private_units(
    v_owner, 'owner-target', 1, v_query
  );
  PERFORM public.k5a_c4_seed_private_units(
    v_member, 'member-target', 1, v_query
  );
  PERFORM public.k5a_c4_assert_g8_findability(v_member, v_owner);

  v_missing := greatest(100 - public.k5a_c4_authorized_unit_count(v_member), 0);
  PERFORM public.k5a_c4_seed_private_units(
    v_member, 'member-to-100', v_missing, NULL
  );
  ANALYZE public.knowledge_audiences;
  ANALYZE public.knowledge_units;
  v_plan_100 := public.k5a_c4_exact_search_plan(v_member, v_query);
  v_design_integrity_100 := public.k5a_c4_plan_design_integrity(
    v_plan_100, 100
  );
  v_p95_100 := public.k5a_c4_measure_p95(
    v_member, v_query, v_member_target
  );

  v_missing := greatest(1001 - public.k5a_c4_authorized_unit_count(v_member), 0);
  PERFORM public.k5a_c4_seed_private_units(
    v_member, 'member-to-1001', v_missing, NULL
  );
  ANALYZE public.knowledge_units;
  v_plan_1001 := public.k5a_c4_exact_search_plan(v_member, v_query);
  v_design_integrity_1001 := public.k5a_c4_plan_design_integrity(
    v_plan_1001, 1001
  );
  v_p95_1001 := public.k5a_c4_measure_p95(
    v_member, v_query, v_member_target
  );

  v_missing := greatest(
    v_curve_probe_units - public.k5a_c4_authorized_unit_count(v_member), 0
  );
  PERFORM public.k5a_c4_seed_private_units(
    v_member, 'member-to-curve-probe', v_missing, NULL
  );
  ANALYZE public.knowledge_units;
  v_plan_curve_probe := public.k5a_c4_exact_search_plan(v_member, v_query);
  v_design_integrity_curve_probe := public.k5a_c4_plan_design_integrity(
    v_plan_curve_probe, v_curve_probe_units
  );
  v_p95_curve_probe := public.k5a_c4_measure_p95(
    v_member, v_query, v_member_target
  );

  v_missing := greatest(1001 - public.k5a_c4_authorized_unit_count(v_owner), 0);
  PERFORM public.k5a_c4_seed_private_units(
    v_owner, 'owner-to-1001', v_missing, NULL
  );
  ANALYZE public.knowledge_units;
  v_plan_owner_before := public.k5a_c4_exact_search_plan(v_owner, v_query);
  v_owner_design_integrity_before := public.k5a_c4_plan_design_integrity(
    v_plan_owner_before, 1001
  );
  SELECT coalesce(jsonb_agg(to_jsonb(hit) ORDER BY hit.unit_id), '[]')
  INTO v_owner_result_before
  FROM public.search_knowledge_units(
    v_owner, v_query, 0.99, 10, NULL, NULL, NULL, NULL
  ) hit;
  FOR i IN 1..5 LOOP
    v_owner_baseline_p95 := array_append(
      v_owner_baseline_p95,
      public.k5a_c4_measure_p95(v_owner, v_query, v_owner_target)
    );
  END LOOP;
  SELECT avg(sample), coalesce(stddev_samp(sample), 0)
  INTO v_owner_p95_before, v_owner_p95_stddev
  FROM unnest(v_owner_baseline_p95) sample;
  v_timing_envelope := 3 * v_owner_p95_stddev;

  -- Grow only the member's private corpus by exactly ten times while the
  -- owner's authorized subset remains fixed at 1,001 units.
  v_foreign_before := public.k5a_c4_authorized_unit_count(v_member);
  v_missing := greatest(
    v_foreign_before * 10
      - public.k5a_c4_authorized_unit_count(v_member),
    0
  );
  PERFORM public.k5a_c4_seed_private_units(
    v_member, 'member-foreign-growth', v_missing, NULL
  );
  ANALYZE public.knowledge_units;
  v_plan_owner_after := public.k5a_c4_exact_search_plan(v_owner, v_query);
  v_owner_design_integrity_after := public.k5a_c4_plan_design_integrity(
    v_plan_owner_after, 1001
  );
  SELECT coalesce(jsonb_agg(to_jsonb(hit) ORDER BY hit.unit_id), '[]')
  INTO v_owner_result_after
  FROM public.search_knowledge_units(
    v_owner, v_query, 0.99, 10, NULL, NULL, NULL, NULL
  ) hit;
  v_owner_p95_after := public.k5a_c4_measure_p95(
    v_owner, v_query, v_owner_target
  );
  v_foreign_after := public.k5a_c4_authorized_unit_count(v_member);

  IF v_design_integrity_100->'row_sources'
      IS DISTINCT FROM v_design_integrity_1001->'row_sources'
    OR v_design_integrity_100->'row_sources'
      IS DISTINCT FROM v_design_integrity_curve_probe->'row_sources'
    OR v_design_integrity_100->'access_paths'
      IS DISTINCT FROM v_design_integrity_1001->'access_paths'
    OR v_design_integrity_100->'access_paths'
      IS DISTINCT FROM v_design_integrity_curve_probe->'access_paths' THEN
    RAISE EXCEPTION 'k5a_c4_r5_plan_semantics_changed:%:%:%',
      v_design_integrity_100, v_design_integrity_1001,
      v_design_integrity_curve_probe;
  END IF;

  IF v_owner_result_before IS DISTINCT FROM v_owner_result_after
    OR v_foreign_after IS DISTINCT FROM v_foreign_before * 10
    OR v_owner_design_integrity_before->'row_sources'
      IS DISTINCT FROM v_owner_design_integrity_after->'row_sources'
    OR v_owner_design_integrity_before->'access_paths'
      IS DISTINCT FROM v_owner_design_integrity_after->'access_paths'
    OR v_owner_design_integrity_before->'unit_rows_read'
      IS DISTINCT FROM v_owner_design_integrity_after->'unit_rows_read' THEN
    RAISE EXCEPTION 'k5a_c4_r5_foreign_corpus_changed:%:%:%:%:%:%:%:%',
      v_owner_result_before, v_owner_result_after,
      v_owner_design_integrity_before, v_owner_design_integrity_after,
      v_owner_baseline_p95, v_owner_p95_after,
      v_timing_envelope, v_foreign_after;
  END IF;

  IF pg_get_functiondef(
      'public.search_knowledge_units(uuid,vector,double precision,integer,uuid,timestamptz,timestamptz,uuid[])'::regprocedure
    ) ~ '(enable_(seqscan|bitmapscan|sort)|ef_search|iterative_scan)'
    OR pg_get_functiondef(
      'public.search_knowledge_units(uuid,vector,double precision,integer,uuid,timestamptz,timestamptz,uuid[])'::regprocedure
    ) LIKE '%knowledge_units_embedding_hnsw%' THEN
    RAISE EXCEPTION 'k5a_c4_r5_planner_forcing_or_ann_survived';
  END IF;

  IF pg_get_functiondef(
      'public.retrieve_knowledge_graph_claims_v3(uuid,uuid,uuid[],integer,integer,integer,integer,integer,integer,integer)'::regprocedure
    ) ~ 'enable_(seqscan|bitmapscan|sort)' THEN
    RAISE EXCEPTION 'k5a_c4_r5_kernel_planner_forcing_survived';
  END IF;

  RAISE NOTICE 'K5A_C4_R5_DESIGN_INTEGRITY:%', jsonb_build_object(
    'p95_ms_100', round(v_p95_100::numeric, 3),
    'p95_ms_1001', round(v_p95_1001::numeric, 3),
    'g5_exact_recall_units', v_curve_probe_units,
    'p95_ms_curve_probe', round(v_p95_curve_probe::numeric, 3),
    'g5_ann_threshold_units', v_curve_probe_units,
    'g5_status', 'confirmed_exact_recall_horizon',
    'owner_baseline_p95_ms', to_jsonb(v_owner_baseline_p95),
    'owner_p95_mean_before_foreign_growth',
      round(v_owner_p95_before::numeric, 3),
    'owner_p95_ms_after_foreign_growth',
      round(v_owner_p95_after::numeric, 3),
    'database_timing_diagnostic_3sigma_ms',
      round(v_timing_envelope::numeric, 3),
    'database_timing_diagnostic_inside_envelope',
      abs(v_owner_p95_before - v_owner_p95_after) <= v_timing_envelope,
    'observable_boundary_timing_status',
      'covered_by_source_coupled_floor_arm',
    'owner_design_integrity', v_owner_design_integrity_after,
    'foreign_authorized_units',
      v_foreign_after
  );
END
$k5a_c4_r5$;
