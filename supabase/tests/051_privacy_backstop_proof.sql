-- =============================================================================
-- Proof harness — ORU-450 database-layer privacy backstop
-- =============================================================================
-- Deterministic, self-seeding SQL proof of the PoC slice in migration 051:
--   • retrieval_events RLS is owner-only for authenticated callers, and the
--     service-role app path still reads every row.
--   • search_knowledge rejects a forged p_user_id from an authenticated caller,
--     accepts an honest self-query, and leaves the service-role app path (the
--     way the real app calls it) unrestricted.
--
-- HOW TO RUN (Test gate, against the live PREVIEW db — NOT prod):
--   psql "$PREVIEW_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/051_privacy_backstop_proof.sql
-- Expected final line on success:  ALL PASS
--
-- The BEFORE control (leak present pre-migration) is a separate recipe step:
--   run the two "AUTHENTICATED forged" probes below against a pre-051 snapshot
--   and observe they RETURN ROWS / SUCCEED — proving the migration is what
--   closes the leak, not the seed data.
--
-- Roles used to simulate callers (Supabase semantics):
--   service_role  → BYPASSRLS, auth.uid() = NULL   (the trusted app path)
--   authenticated → RLS enforced, auth.uid() = the jwt `sub` claim we set
-- =============================================================================

BEGIN;
SET client_min_messages = warning;

-- --- Seed two families: A and B ------------------------------------------------
-- Use fixed uuids so probes are deterministic.
\set userA '00000000-0000-0000-0000-00000000000a'
\set userB '00000000-0000-0000-0000-00000000000b'

-- Seed as definer/owner (this script runs as the migration/service owner).
INSERT INTO public.retrieval_events (user_id, query, nodes_returned)
VALUES (:'userA', 'family A private query', ARRAY[]::uuid[]),
       (:'userB', 'family B private query', ARRAY[]::uuid[]);

DO $proof$
DECLARE
  n INT;
  ok BOOLEAN := TRUE;
  raised BOOLEAN;
BEGIN
  -- ===========================================================================
  -- retrieval_events: owner-only for authenticated; full for service_role
  -- ===========================================================================

  -- (a) authenticated B must NOT see A's retrieval_events
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000b')::text, TRUE);
  SELECT count(*) INTO n FROM public.retrieval_events
    WHERE user_id = '00000000-0000-0000-0000-00000000000a';
  RESET role;
  IF n = 0 THEN RAISE NOTICE 'PASS retrieval_events: authenticated B sees 0 of A''s rows';
  ELSE ok := FALSE; RAISE WARNING 'FAIL retrieval_events: authenticated B saw % of A''s rows', n; END IF;

  -- (b) authenticated B DOES see its own rows
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000b')::text, TRUE);
  SELECT count(*) INTO n FROM public.retrieval_events
    WHERE user_id = '00000000-0000-0000-0000-00000000000b';
  RESET role;
  IF n >= 1 THEN RAISE NOTICE 'PASS retrieval_events: authenticated B sees its own rows';
  ELSE ok := FALSE; RAISE WARNING 'FAIL retrieval_events: authenticated B could not see its own rows'; END IF;

  -- (c) service_role (app path) still sees every row
  SET LOCAL role service_role;
  SELECT count(*) INTO n FROM public.retrieval_events;
  RESET role;
  IF n >= 2 THEN RAISE NOTICE 'PASS retrieval_events: service_role app path reads all rows (%).', n;
  ELSE ok := FALSE; RAISE WARNING 'FAIL retrieval_events: service_role app path regressed (saw %)', n; END IF;

  -- ===========================================================================
  -- search_knowledge: auth.uid() gate. The exception fires before row work, so
  -- a zero-vector embedding is enough to exercise the gate deterministically.
  -- ===========================================================================

  -- (d) authenticated B forging p_user_id = A  → must be REJECTED
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000b')::text, TRUE);
  raised := FALSE;
  BEGIN
    PERFORM * FROM public.search_knowledge(
      array_fill(0::real, ARRAY[1536])::vector,
      p_user_id => '00000000-0000-0000-0000-00000000000a'::uuid);
  EXCEPTION WHEN insufficient_privilege THEN raised := TRUE;
  END;
  RESET role;
  IF raised THEN RAISE NOTICE 'PASS search_knowledge: authenticated forged p_user_id rejected';
  ELSE ok := FALSE; RAISE WARNING 'FAIL search_knowledge: authenticated forged p_user_id was NOT rejected'; END IF;

  -- (e) authenticated B honest self-query (p_user_id = B)  → must SUCCEED
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000b')::text, TRUE);
  raised := FALSE;
  BEGIN
    PERFORM * FROM public.search_knowledge(
      array_fill(0::real, ARRAY[1536])::vector,
      p_user_id => '00000000-0000-0000-0000-00000000000b'::uuid);
  EXCEPTION WHEN OTHERS THEN raised := TRUE;
  END;
  RESET role;
  IF NOT raised THEN RAISE NOTICE 'PASS search_knowledge: authenticated honest self-query allowed';
  ELSE ok := FALSE; RAISE WARNING 'FAIL search_knowledge: authenticated honest self-query was rejected'; END IF;

  -- (f) service_role app path with any p_user_id  → must SUCCEED (no regression)
  SET LOCAL role service_role;
  raised := FALSE;
  BEGIN
    PERFORM * FROM public.search_knowledge(
      array_fill(0::real, ARRAY[1536])::vector,
      p_user_id => '00000000-0000-0000-0000-00000000000a'::uuid);
  EXCEPTION WHEN OTHERS THEN raised := TRUE;
  END;
  RESET role;
  IF NOT raised THEN RAISE NOTICE 'PASS search_knowledge: service_role app path unrestricted';
  ELSE ok := FALSE; RAISE WARNING 'FAIL search_knowledge: service_role app path regressed'; END IF;

  -- ===========================================================================
  IF ok THEN RAISE NOTICE 'ALL PASS';
  ELSE RAISE EXCEPTION 'PROOF FAILED — see WARNINGs above';
  END IF;
END
$proof$;

ROLLBACK;  -- proof is non-destructive; seed rows are discarded.
