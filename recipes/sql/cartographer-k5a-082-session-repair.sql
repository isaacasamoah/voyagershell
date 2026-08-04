\set ON_ERROR_STOP on

-- 082 restores the session id 079's outer SELECT dropped. Only EXECUTION proves
-- it: a plpgsql body is not planned at CREATE time, so the ten-target/nine-
-- expression read installed clean on every database and raised 42601 the first
-- time a viewer with reachable graph nodes actually called it. Asserting the
-- migration applies would have proven nothing.
--
-- The C3 corpus seeds every source event with one known session id, so a claim
-- carrying that value end to end is the whole repair: computed in the scored
-- CTE, carried through the candidate table, read back out of the envelope.
DO $k5a_082_session_repair$
DECLARE
  v_member uuid := '72000000-0000-4000-8000-000000000002';
  v_session text := '72000000-0000-4000-8000-000000000012';
  v_result jsonb;
  v_claims integer;
  v_missing_key integer;
  v_seeded_sessions integer;
BEGIN
  v_result := public.retrieve_knowledge_graph_claims_v3(
    v_member, v_member, '{}'::uuid[], 8, 8, 64, 16, 8, 512, 128
  );
  IF v_result IS NULL OR NOT v_result ? 'claims' OR NOT v_result ? 'truncated' THEN
    RAISE EXCEPTION 'k5a_082_envelope_shape_failed:%', v_result;
  END IF;

  v_claims := jsonb_array_length(v_result->'claims');
  IF v_claims = 0 THEN
    RAISE EXCEPTION 'k5a_082_reader_returned_no_claims:%', v_result;
  END IF;

  SELECT count(*) INTO v_missing_key
  FROM jsonb_array_elements(v_result->'claims') claim
  WHERE NOT claim ? 'sessionId';
  IF v_missing_key <> 0 THEN
    RAISE EXCEPTION 'k5a_082_session_key_absent:%:%', v_missing_key, v_result;
  END IF;

  SELECT count(*) INTO v_seeded_sessions
  FROM jsonb_array_elements(v_result->'claims') claim
  WHERE claim->>'sessionId' = v_session;
  IF v_seeded_sessions = 0 THEN
    RAISE EXCEPTION 'k5a_082_session_id_not_projected:%:%', v_claims, v_result;
  END IF;
END $k5a_082_session_repair$;

SELECT 'CARTOGRAPHER_K5A_082_SESSION_REPAIR_GREEN';
