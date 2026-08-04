CREATE OR REPLACE FUNCTION public.k5a_c4_measure_p95(
  p_viewer_profile_id uuid,
  p_query_embedding vector(1536),
  p_expected_unit_id uuid,
  p_repetitions integer DEFAULT 20
) RETURNS double precision
LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
  v_started timestamptz;
  v_elapsed double precision;
  v_samples double precision[] := '{}';
  v_result jsonb;
  i integer;
BEGIN
  IF p_repetitions < 20 THEN
    RAISE EXCEPTION 'k5a_c4_p95_sample_too_small';
  END IF;
  -- One warm read is excluded from the curve.
  PERFORM * FROM public.search_knowledge_units(
    p_viewer_profile_id, p_query_embedding, 0.99, 10,
    NULL, NULL, NULL, NULL
  );
  FOR i IN 1..p_repetitions LOOP
    v_started := clock_timestamp();
    SELECT coalesce(jsonb_agg(to_jsonb(hit) ORDER BY hit.unit_id), '[]')
    INTO v_result
    FROM public.search_knowledge_units(
      p_viewer_profile_id, p_query_embedding, 0.99, 10,
      NULL, NULL, NULL, NULL
    ) hit;
    v_elapsed := extract(epoch FROM clock_timestamp() - v_started) * 1000;
    IF jsonb_array_length(v_result) <> 1
      OR (v_result->0->>'unit_id')::uuid IS DISTINCT FROM p_expected_unit_id
      OR (v_result->0->>'similarity')::double precision IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'k5a_c4_exact_recall_failed:%:%',
        p_expected_unit_id, v_result;
    END IF;
    v_samples := array_append(v_samples, v_elapsed);
  END LOOP;
  RETURN (
    SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY sample)
    FROM unnest(v_samples) sample
  );
END
$$;
