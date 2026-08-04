-- Clean post-G8 envelope measurement. Each scale gets ten same-session A/B
-- pairs, and each p95 is itself twenty warm exact-search observations.
-- Foreign growth reaches exactly 10x the fixed viewer-authorized cardinality.
\if :{?response_floor_ms}
\else
  \echo 'response_floor_ms must be supplied from boundary.ts'
  \quit
\endif
\if :{?boundary_overhead_ms}
\else
  \echo 'boundary_overhead_ms must be supplied from the sealed receipt'
  \quit
\endif
\if :{?boundary_jitter_stddev_ms}
\else
  \echo 'boundary_jitter_stddev_ms must be supplied from the sealed receipt'
  \quit
\endif

CREATE TEMP TABLE k5a_g8_curve_config (
  response_floor_ms double precision NOT NULL CHECK (response_floor_ms > 0),
  boundary_overhead_ms double precision NOT NULL CHECK (boundary_overhead_ms >= 0),
  boundary_jitter_stddev_ms double precision NOT NULL
    CHECK (boundary_jitter_stddev_ms >= 0)
);
INSERT INTO k5a_g8_curve_config VALUES (
  :response_floor_ms, :boundary_overhead_ms, :boundary_jitter_stddev_ms
);

CREATE TEMP TABLE k5a_g8_curve_pairs (
  authorized_units integer NOT NULL,
  pair_number integer NOT NULL,
  foreign_units_before integer NOT NULL,
  foreign_units_after integer NOT NULL,
  before_growth_p95_ms double precision NOT NULL,
  after_growth_p95_ms double precision NOT NULL,
  PRIMARY KEY (authorized_units, pair_number)
);

DO $k5a_g8_curve$
DECLARE
  v_sizes integer[] := ARRAY[100, 500, 1000, 1200, 1300, 1400, 1500, 2000];
  v_size integer;
  v_pair integer;
  v_viewer uuid;
  v_foreign_viewer uuid;
  v_target uuid;
  v_query vector(1536) :=
    (array_fill(0::real, ARRAY[1534]) || ARRAY[1::real, 0::real])::vector;
  v_before_count integer;
  v_after_count integer;
  v_before_p95 double precision;
  v_after_p95 double precision;
BEGIN
  FOREACH v_size IN ARRAY v_sizes LOOP
    v_viewer := md5(format('k5a-g8-curve-viewer:%s', v_size))::uuid;
    v_foreign_viewer := md5(format('k5a-g8-curve-foreign:%s', v_size))::uuid;
    v_target := md5(format(
      'k5a-c4-r5-unit:%s:%s:%s', v_viewer, 'g8-curve-target', 1
    ))::uuid;

    INSERT INTO auth.users(id, email, raw_user_meta_data, created_at)
    VALUES
      (v_viewer, format('k5a-g8-%s@example.invalid', v_size),
        jsonb_build_object('display_name', format('G8 curve %s', v_size)),
        clock_timestamp()),
      (v_foreign_viewer, format('k5a-g8-foreign-%s@example.invalid', v_size),
        jsonb_build_object('display_name', format('G8 foreign %s', v_size)),
        clock_timestamp())
    ON CONFLICT DO NOTHING;

    PERFORM public.k5a_c4_seed_private_units(
      v_viewer, 'g8-curve-target', 1, v_query
    );
    PERFORM public.k5a_c4_seed_private_units(
      v_viewer, 'g8-curve-fill', v_size - 1, NULL
    );
    IF public.k5a_c4_authorized_unit_count(v_viewer) IS DISTINCT FROM v_size THEN
      RAISE EXCEPTION 'k5a_g8_curve_authorized_count_mismatch:%', v_size;
    END IF;
    ANALYZE public.knowledge_audiences;
    ANALYZE public.knowledge_units;

    FOR v_pair IN 1..10 LOOP
      v_before_count := public.k5a_c4_authorized_unit_count(v_foreign_viewer);
      v_before_p95 := public.k5a_c4_measure_p95(
        v_viewer, v_query, v_target, 20
      );
      PERFORM public.k5a_c4_seed_private_units(
        v_foreign_viewer, format('g8-curve-%s-pair-%s', v_size, v_pair),
        v_size, NULL
      );
      ANALYZE public.knowledge_units;
      v_after_count := public.k5a_c4_authorized_unit_count(v_foreign_viewer);
      IF v_after_count - v_before_count IS DISTINCT FROM v_size THEN
        RAISE EXCEPTION 'k5a_g8_curve_foreign_growth_mismatch:%:%:%',
          v_size, v_before_count, v_after_count;
      END IF;
      v_after_p95 := public.k5a_c4_measure_p95(
        v_viewer, v_query, v_target, 20
      );
      INSERT INTO k5a_g8_curve_pairs VALUES (
        v_size, v_pair, v_before_count, v_after_count,
        v_before_p95, v_after_p95
      );
    END LOOP;
  END LOOP;
END
$k5a_g8_curve$;

CREATE TEMP VIEW k5a_g8_curve_derived AS
WITH per_size AS (
  SELECT authorized_units,
    max(greatest(before_growth_p95_ms, after_growth_p95_ms)) AS worst_p95_ms,
    percentile_disc(0.95) WITHIN GROUP (
      ORDER BY abs(before_growth_p95_ms - after_growth_p95_ms)
    ) AS paired_margin_p95_ms
  FROM k5a_g8_curve_pairs GROUP BY authorized_units
)
SELECT per_size.*,
  config.boundary_overhead_ms,
  3 * config.boundary_jitter_stddev_ms AS boundary_jitter_3sigma_ms,
  per_size.worst_p95_ms + config.boundary_overhead_ms
    + per_size.paired_margin_p95_ms
    + 3 * config.boundary_jitter_stddev_ms AS derived_floor_ms
FROM per_size CROSS JOIN k5a_g8_curve_config config;

SELECT jsonb_build_object(
  'method', 'ten_same_session_pairs_twenty_warm_reads_each',
  'response_floor_ms_from_source', config.response_floor_ms,
  'boundary_overhead_ms_from_receipt', config.boundary_overhead_ms,
  'boundary_jitter_stddev_ms_from_receipt', config.boundary_jitter_stddev_ms,
  'curve', (SELECT jsonb_agg(jsonb_build_object(
    'authorized_units', authorized_units,
    'worst_p95_ms', round(worst_p95_ms::numeric, 3),
    'paired_margin_p95_ms', round(paired_margin_p95_ms::numeric, 3),
    'boundary_overhead_ms', round(boundary_overhead_ms::numeric, 3),
    'boundary_jitter_3sigma_ms', round(boundary_jitter_3sigma_ms::numeric, 3),
    'derived_floor_ms', round(derived_floor_ms::numeric, 3)
  ) ORDER BY authorized_units) FROM k5a_g8_curve_derived),
  'floor_for_1500_ms', (SELECT ceil(derived_floor_ms)
    FROM k5a_g8_curve_derived WHERE authorized_units = 1500),
  'largest_measured_horizon_for_current_floor', (SELECT max(authorized_units)
    FROM k5a_g8_curve_derived
    WHERE derived_floor_ms <= config.response_floor_ms),
  'pairs', (SELECT jsonb_agg(jsonb_build_object(
    'authorized_units', authorized_units, 'pair', pair_number,
    'foreign_units_before', foreign_units_before,
    'foreign_units_after', foreign_units_after,
    'before_growth_p95_ms', round(before_growth_p95_ms::numeric, 3),
    'after_growth_p95_ms', round(after_growth_p95_ms::numeric, 3),
    'absolute_delta_ms', round(abs(
      before_growth_p95_ms - after_growth_p95_ms)::numeric, 3)
  ) ORDER BY authorized_units, pair_number) FROM k5a_g8_curve_pairs)
) FROM k5a_g8_curve_config config;

SELECT 'CARTOGRAPHER_K5A_G8_CURVE_GREEN';
