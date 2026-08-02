\set ON_ERROR_STOP on
WITH fixture AS (
  SELECT
    (SELECT id FROM public.knowledge_units
      WHERE claim = 'The rehearsal starts at six.') AS selected_id,
    (SELECT id FROM public.knowledge_units
      WHERE claim = 'The private schedule moved rehearsal to eight.') AS suppressed_id
), exclusions AS (
  SELECT array_agg(unit.id ORDER BY unit.id) AS ids
  FROM public.knowledge_units unit, fixture
  WHERE unit.id NOT IN (fixture.selected_id, fixture.suppressed_id)
), result AS (
  SELECT public.k5a_c3_selecting_read_poc(
    '72000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000002',
    exclusions.ids, 1, 8, 16, 4, 8, 512, 128
  ) AS value
  FROM exclusions
)
SELECT CASE
  WHEN jsonb_array_length(value->'claims') = 1
    AND jsonb_array_length(value->'claims'->0->'tensions') = 0
    AND value->>'truncated' = 'true'
  THEN 'K5A_C3_CONCURRENT_PROBE_GREEN'
  ELSE 'K5A_C3_CONCURRENT_PROBE_FAILED'
END
FROM result;
