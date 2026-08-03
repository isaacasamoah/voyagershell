DO $k5a_birth_zero_measurement$
DECLARE
  v_curve_viewer uuid := '74000000-0000-4000-8000-000000000010';
  v_supported_viewer uuid := '74000000-0000-4000-8000-000000000011';
  v_foreign_viewer uuid := '74000000-0000-4000-8000-000000000012';
  v_birth_zero_measurement jsonb;
BEGIN
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
$k5a_birth_zero_measurement$;
