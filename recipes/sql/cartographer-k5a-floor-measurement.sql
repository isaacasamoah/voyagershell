-- Clean G6/G5 measurement. This runs only after the R5 C4 battery has installed
-- its exact-search seed and measurement helpers in the same warm, disposable
-- session. It contains no EXPLAIN and changes no production object.

\if :{?existing_response_floor_ms}
\else
  \echo 'existing_response_floor_ms must be supplied from boundary.ts'
  \quit
\endif

CREATE TEMP TABLE k5a_floor_config (
  existing_response_floor_ms double precision NOT NULL
    CHECK (existing_response_floor_ms > 0)
);
INSERT INTO k5a_floor_config VALUES (:existing_response_floor_ms);

CREATE TEMP TABLE k5a_floor_curve (
  authorized_units integer PRIMARY KEY,
  p95_ms double precision NOT NULL
);

CREATE TEMP TABLE k5a_floor_pairs (
  pair_number integer PRIMARY KEY,
  foreign_units_before integer NOT NULL,
  foreign_units_after integer NOT NULL,
  before_growth_p95_ms double precision NOT NULL,
  after_growth_p95_ms double precision NOT NULL
);

DO $k5a_floor_measurement$
DECLARE
  v_curve_viewer uuid := '74000000-0000-4000-8000-000000000010';
  v_supported_viewer uuid := '74000000-0000-4000-8000-000000000011';
  v_foreign_viewer uuid := '74000000-0000-4000-8000-000000000012';
  v_query vector(1536) :=
    (array_fill(0::real, ARRAY[1534]) || ARRAY[1::real, 0::real])::vector;
  v_curve_target uuid := md5(format(
    'k5a-c4-r5-unit:%s:%s:%s', v_curve_viewer, 'floor-curve-target', 1
  ))::uuid;
  v_supported_target uuid := md5(format(
    'k5a-c4-r5-unit:%s:%s:%s',
    v_supported_viewer, 'floor-supported-target', 1
  ))::uuid;
  v_sizes integer[] := ARRAY[100, 500, 1001, 1200, 1300, 1400, 1500,
    1600, 1800, 2000];
  v_size integer;
  v_missing integer;
  v_p95 double precision;
  v_supported_units integer;
  v_existing_response_floor_ms double precision;
  v_foreign_before integer;
  v_foreign_after integer;
  v_a double precision;
  v_b double precision;
  v_birth_zero_measurement jsonb;
  i integer;
BEGIN
  SELECT existing_response_floor_ms INTO STRICT v_existing_response_floor_ms
  FROM k5a_floor_config;
  INSERT INTO auth.users(id, email, raw_user_meta_data, created_at)
  VALUES
    (v_curve_viewer, 'k5a-floor-curve@example.invalid',
      '{"display_name":"K5a floor curve"}'::jsonb, clock_timestamp()),
    (v_supported_viewer, 'k5a-floor-supported@example.invalid',
      '{"display_name":"K5a floor supported"}'::jsonb, clock_timestamp()),
    (v_foreign_viewer, 'k5a-floor-foreign@example.invalid',
      '{"display_name":"K5a floor foreign"}'::jsonb, clock_timestamp())
  ON CONFLICT DO NOTHING;

  PERFORM public.k5a_c4_seed_private_units(
    v_curve_viewer, 'floor-curve-target', 1, v_query
  );
  FOREACH v_size IN ARRAY v_sizes LOOP
    v_missing := greatest(
      v_size - public.k5a_c4_authorized_unit_count(v_curve_viewer), 0
    );
    PERFORM public.k5a_c4_seed_private_units(
      v_curve_viewer, format('floor-curve-to-%s', v_size), v_missing, NULL
    );
    ANALYZE public.knowledge_audiences;
    ANALYZE public.knowledge_units;
    v_p95 := public.k5a_c4_measure_p95(
      v_curve_viewer, v_query, v_curve_target, 20
    );
    INSERT INTO k5a_floor_curve(authorized_units, p95_ms)
    VALUES (v_size, v_p95);
    EXIT WHEN v_p95 > v_existing_response_floor_ms AND v_size > 1001;
  END LOOP;

  SELECT max(authorized_units) INTO v_supported_units
  FROM k5a_floor_curve
  WHERE p95_ms <= v_existing_response_floor_ms;
  IF v_supported_units IS NULL THEN
    RAISE EXCEPTION 'k5a_floor_no_supported_scale_below_existing_floor';
  END IF;

  PERFORM public.k5a_c4_seed_private_units(
    v_supported_viewer, 'floor-supported-target', 1, v_query
  );
  v_missing := greatest(
    v_supported_units
      - public.k5a_c4_authorized_unit_count(v_supported_viewer),
    0
  );
  PERFORM public.k5a_c4_seed_private_units(
    v_supported_viewer, 'floor-supported-fill', v_missing, NULL
  );
  ANALYZE public.knowledge_audiences;
  ANALYZE public.knowledge_units;

  FOR i IN 1..5 LOOP
    -- Each same-session pair directly repeats the condition behind the prior
    -- 0.65 ms observation: fixed authorized subset, then foreign-only growth.
    v_foreign_before := public.k5a_c4_authorized_unit_count(v_foreign_viewer);
    v_a := public.k5a_c4_measure_p95(
      v_supported_viewer, v_query, v_supported_target, 20
    );
    PERFORM public.k5a_c4_seed_private_units(
      v_foreign_viewer, format('floor-foreign-pair-%s', i),
      v_supported_units, NULL
    );
    ANALYZE public.knowledge_units;
    v_foreign_after := public.k5a_c4_authorized_unit_count(v_foreign_viewer);
    IF v_foreign_after - v_foreign_before IS DISTINCT FROM v_supported_units THEN
      RAISE EXCEPTION 'k5a_floor_foreign_growth_mismatch:%:%:%',
        v_foreign_before, v_foreign_after, v_supported_units;
    END IF;
    v_b := public.k5a_c4_measure_p95(
      v_supported_viewer, v_query, v_supported_target, 20
    );
    INSERT INTO k5a_floor_pairs(
      pair_number, foreign_units_before, foreign_units_after,
      before_growth_p95_ms, after_growth_p95_ms
    ) VALUES (i, v_foreign_before, v_foreign_after, v_a, v_b);
  END LOOP;

  RAISE NOTICE 'K5A_FLOOR_DATABASE_MEASUREMENT:%', jsonb_build_object(
    'method', 'warm_no_explain_same_session',
    'curve', (
      SELECT jsonb_agg(jsonb_build_object(
        'authorized_units', authorized_units,
        'p95_ms', round(p95_ms::numeric, 3)
      ) ORDER BY authorized_units)
      FROM k5a_floor_curve
    ),
    'supported_authorized_units', v_supported_units,
    'supported_pairs', (
      SELECT jsonb_agg(jsonb_build_object(
        'pair', pair_number,
        'foreign_units_before', foreign_units_before,
        'foreign_units_after', foreign_units_after,
        'before_growth_p95_ms', round(before_growth_p95_ms::numeric, 3),
        'after_growth_p95_ms', round(after_growth_p95_ms::numeric, 3),
        'absolute_delta_ms', round(
          abs(before_growth_p95_ms - after_growth_p95_ms)::numeric, 3
        )
      ) ORDER BY pair_number)
      FROM k5a_floor_pairs
    ),
    'supported_p95_mean_ms', (
      SELECT round(avg(sample)::numeric, 3)
      FROM k5a_floor_pairs
      CROSS JOIN LATERAL (VALUES
        (before_growth_p95_ms), (after_growth_p95_ms)
      ) samples(sample)
    ),
    'supported_p95_sample_stddev_ms', (
      SELECT round(stddev_samp(sample)::numeric, 3)
      FROM k5a_floor_pairs
      CROSS JOIN LATERAL (VALUES
        (before_growth_p95_ms), (after_growth_p95_ms)
      ) samples(sample)
    ),
    'supported_p95_max_ms', (
      SELECT round(max(sample)::numeric, 3)
      FROM k5a_floor_pairs
      CROSS JOIN LATERAL (VALUES
        (before_growth_p95_ms), (after_growth_p95_ms)
      ) samples(sample)
    ),
    'paired_delta_p95_ms', (
      SELECT round((percentile_disc(0.95) WITHIN GROUP (
        ORDER BY abs(before_growth_p95_ms - after_growth_p95_ms)
      ))::numeric, 3)
      FROM k5a_floor_pairs
    )
  );

  -- G8 widens exact search from positive birth attention to the whole
  -- physics-complete authorized set. Measure that legal zero class without
  -- changing the canonical bench population.
  WITH totals AS (
    SELECT count(*)::integer AS total_units,
      count(*) FILTER (WHERE attention_score = 0)::integer
        AS birth_zero_units
    FROM public.knowledge_units
  ), bench_viewers(label, viewer_profile_id) AS (
    VALUES ('curve', v_curve_viewer), ('supported', v_supported_viewer),
      ('foreign', v_foreign_viewer)
  ), authorized_units AS (
    SELECT viewer.label, unit.attention_score,
      unit.embedding IS NOT NULL AND unit.knowledge_type IS NOT NULL
        AND unit.attention_score IS NOT NULL AS physics_complete,
      public.viewer_has_graph_node_grant(
        public.canonical_graph_node_id('knowledge_unit', unit.id),
        viewer.viewer_profile_id
      ) AS granted
    FROM bench_viewers viewer
    JOIN public.knowledge_audiences audience ON
      audience.member_profile_ids @> ARRAY[viewer.viewer_profile_id]::uuid[]
    JOIN public.knowledge_units unit
      ON unit.knowledge_audience_id = audience.id
  ), authorized_sizes AS (
    SELECT units.label,
      count(*) FILTER (WHERE physics_complete AND granted)::integer
        AS all_complete_units,
      count(*) FILTER (WHERE physics_complete AND granted
        AND attention_score > 0)::integer AS positive_birth_units,
      count(*) FILTER (WHERE physics_complete AND granted
        AND attention_score = 0)::integer AS birth_zero_units
    FROM authorized_units units GROUP BY units.label
  )
  SELECT jsonb_build_object(
    'total_units', totals.total_units,
    'birth_zero_units', totals.birth_zero_units,
    'birth_zero_fraction', CASE WHEN totals.total_units = 0 THEN 0
      ELSE totals.birth_zero_units::numeric / totals.total_units END,
    'authorized_subsets', (
      SELECT jsonb_agg(jsonb_build_object(
        'viewer', sizes.label, 'positive_birth_units', sizes.positive_birth_units,
        'birth_zero_units', sizes.birth_zero_units,
        'all_complete_units', sizes.all_complete_units
      ) ORDER BY sizes.label)
      FROM authorized_sizes sizes
    )
  ) INTO STRICT v_birth_zero_measurement
  FROM totals;
  RAISE NOTICE 'K5A_BIRTH_ZERO_MEASUREMENT:%', v_birth_zero_measurement;
  RAISE NOTICE 'CARTOGRAPHER_K5A_BIRTH_ZERO_MEASUREMENT_GREEN';
END
$k5a_floor_measurement$;

SELECT 'CARTOGRAPHER_K5A_FLOOR_DATABASE_GREEN';
