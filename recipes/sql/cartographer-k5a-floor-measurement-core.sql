-- Clean G6/G5 measurement. This runs only after the R5 C4 battery has installed
-- its exact-search seed and measurement helpers in the same warm, disposable
-- session. It contains no EXPLAIN and changes no production object.

\if :{?response_floor_ms}
\else
  \echo 'response_floor_ms must be supplied from boundary.ts'
  \quit
\endif
\if :{?boundary_overhead_ms}
\else
  \echo 'boundary_overhead_ms must be supplied from the measurement receipt'
  \quit
\endif
\if :{?g5_exact_units}
\else
  \echo 'g5_exact_units must be supplied from the measurement receipt'
  \quit
\endif

CREATE TEMP TABLE k5a_floor_config (
  response_floor_ms double precision NOT NULL CHECK (response_floor_ms > 0),
  boundary_overhead_ms double precision NOT NULL CHECK (boundary_overhead_ms >= 0),
  g5_exact_units integer NOT NULL CHECK (g5_exact_units > 0)
);
INSERT INTO k5a_floor_config VALUES (
  :response_floor_ms, :boundary_overhead_ms, :g5_exact_units
);

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
  v_response_floor_ms double precision;
  v_boundary_overhead_ms double precision;
  v_database_budget_ms double precision;
  v_foreign_before integer;
  v_foreign_after integer;
  v_a double precision;
  v_b double precision;
  i integer;
BEGIN
  SELECT response_floor_ms, boundary_overhead_ms, g5_exact_units
  INTO STRICT v_response_floor_ms, v_boundary_overhead_ms, v_supported_units
  FROM k5a_floor_config;
  v_database_budget_ms := v_response_floor_ms - v_boundary_overhead_ms;
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
    EXIT WHEN v_p95 > v_response_floor_ms AND v_size > v_supported_units;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM k5a_floor_curve
      WHERE authorized_units = v_supported_units
        AND p95_ms < v_database_budget_ms) THEN
    RAISE EXCEPTION 'k5a_floor_confirmed_horizon_over_database_budget:%:%:%',
      v_supported_units, v_database_budget_ms,
      (SELECT p95_ms FROM k5a_floor_curve
        WHERE authorized_units = v_supported_units);
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

  -- Emit the complete paired evidence before the hard assertion so a firing
  -- remains diagnosable even though the surrounding DO block rolls back.
  RAISE NOTICE 'K5A_FLOOR_SUPPORTED_PAIRS:%', (
    SELECT jsonb_agg(jsonb_build_object(
      'pair', pair_number,
      'foreign_units_before', foreign_units_before,
      'foreign_units_after', foreign_units_after,
      'before_growth_p95_ms', round(before_growth_p95_ms::numeric, 3),
      'after_growth_p95_ms', round(after_growth_p95_ms::numeric, 3)
    ) ORDER BY pair_number)
    FROM k5a_floor_pairs
  );

  IF (SELECT max(sample) FROM k5a_floor_pairs CROSS JOIN LATERAL
      (VALUES (before_growth_p95_ms), (after_growth_p95_ms)) samples(sample))
      >= v_database_budget_ms THEN
    RAISE EXCEPTION 'k5a_floor_supported_pair_over_database_budget:%:%',
      v_database_budget_ms, (SELECT max(sample) FROM k5a_floor_pairs
        CROSS JOIN LATERAL (VALUES
          (before_growth_p95_ms), (after_growth_p95_ms)) samples(sample));
  END IF;

  RAISE NOTICE 'K5A_FLOOR_DATABASE_MEASUREMENT:%', jsonb_build_object(
    'method', 'warm_no_explain_same_session',
    'response_floor_ms_from_source', v_response_floor_ms,
    'boundary_overhead_ms_from_receipt', v_boundary_overhead_ms,
    'database_budget_ms', v_database_budget_ms,
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

END
$k5a_floor_measurement$;
