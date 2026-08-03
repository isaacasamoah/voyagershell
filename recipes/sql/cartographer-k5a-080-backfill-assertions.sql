-- Prove G9's bounded, v4-only seed and durable drain marker.
DO $k5a_080_backfill$
DECLARE
  v_result jsonb;
  v_message text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.knowledge_extraction_jobs
    WHERE source_event_id = '80000000-0000-4000-8000-000000000001'
      AND extractor_version = 'cartographer-single-claim-v4'
      AND state = 'pending'
  ) THEN
    RAISE EXCEPTION 'k5a_080_eligible_event_not_seeded';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.knowledge_extraction_jobs
    WHERE source_event_id = '80000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'k5a_080_deferred_c5_event_seeded';
  END IF;

  BEGIN
    PERFORM public.assert_knowledge_extraction_coverage_backfill_complete();
    RAISE EXCEPTION 'k5a_080_undrained_jobs_accepted';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message NOT LIKE 'knowledge_extraction_coverage_backfill_incomplete:%'
    THEN RAISE; END IF;
  END;

  UPDATE public.knowledge_extraction_jobs
  SET state = 'no_claim', updated_at = clock_timestamp()
  WHERE extractor_version = 'cartographer-single-claim-v4'
    AND state = 'pending';
  v_result := public.assert_knowledge_extraction_coverage_backfill_complete();
  IF (v_result->>'missing_jobs')::integer <> 0
    OR (v_result->>'undrained_jobs')::integer <> 0
    OR NOT EXISTS (
      SELECT 1 FROM public.knowledge_extraction_coverage_backfill_markers marker
      WHERE marker.extractor_version = 'cartographer-single-claim-v4'
        AND marker.job_limit = 256
        AND marker.eligible_event_count = (v_result->>'eligible_event_count')::integer
    ) THEN
    RAISE EXCEPTION 'k5a_080_drain_marker_invalid:%', v_result;
  END IF;

  BEGIN
    UPDATE public.knowledge_extraction_coverage_backfill_markers
    SET eligible_event_count = eligible_event_count + 1;
    RAISE EXCEPTION 'k5a_080_drain_marker_mutable';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'knowledge_extraction_coverage_backfill_markers_immutable'
    THEN RAISE; END IF;
  END;
END
$k5a_080_backfill$;

SELECT 'CARTOGRAPHER_K5A_080_BACKFILL_GREEN';
