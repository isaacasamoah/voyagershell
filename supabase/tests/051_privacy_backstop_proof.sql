-- =============================================================================
-- Proof harness — ORU-450 database-layer privacy backstop
-- =============================================================================
-- Deterministic, self-seeding SQL proof of migration 051's full backstop:
--   • retrieval_events RLS is owner-only for authenticated callers, and the
--     service-role app path still reads every row.
--   • search_knowledge rejects a forged p_user_id from an authenticated caller,
--     rejects a non-member naming another family's voyage, accepts an honest
--     self-query, and leaves the service-role app path (the way the real app
--     calls it) unrestricted.
--   • spaces / space_members / voyage_invites RLS: a signed-in NON-member reads
--     0 rows of another family's room, roster, and invitee emails; the real
--     member/captain still sees their own.
--   • graph_traverse: caller-scoped — an A-scoped traversal sees A's node, a
--     B-scoped or unscoped traversal sees nothing of A's personal graph.
--   • EXECUTE-surface lockdown: anon cannot EXECUTE search_knowledge (proves the
--     REVOKE ... FROM PUBLIC), and neither anon nor authenticated can EXECUTE
--     graph_traverse (proves it is locked to service_role). These fire at the
--     grant layer, before any row work, so they are seed-independent.
--
-- KNOWN HARNESS LIMITS (row-level positives — deferred, tracked for follow-up):
--   The self-query / member positives (probes e, f3) assert "no exception", not
--   "N rows returned", because the seed uses NULL embeddings and the probes use a
--   zero query vector (cosine distance is undefined → no rows match regardless of
--   scope). Turning these into row-count assertions — and adding a member-forges-
--   p_participants L4 probe — needs a real matching-embedding fixture; the code
--   defenses themselves (the p_participants := ARRAY[auth.uid()] override and the
--   voyage-membership gate) are exercised by the exception-based probes (d, f2).
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

-- --- Identities behind the FKs (spaces/voyages need real profiles) -----------
-- A = family-A captain/owner; B = a signed-in NON-member of family A.
INSERT INTO auth.users (id, email)
VALUES (:'userA', 'a-450@proof.local'), (:'userB', 'b-450@proof.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, display_name)
VALUES (:'userA', 'a-450@proof.local', 'Family A'),
       (:'userB', 'b-450@proof.local', 'Family B')
ON CONFLICT (id) DO NOTHING;

-- --- Family A's voyage + captaincy -------------------------------------------
\set voyA '00000000-0000-0000-0000-0000000000a1'
INSERT INTO public.voyages (id, slug, name)
VALUES (:'voyA', 'fam-a-450', 'Family A Voyage')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.voyage_members (voyage_id, user_id, role)
VALUES (:'voyA', :'userA', 'captain')
ON CONFLICT (voyage_id, user_id) DO NOTHING;

-- --- voyage_invites: one pending invite A issued in family A's voyage --------
INSERT INTO public.voyage_invites (voyage_id, email, invited_by, status)
VALUES (:'voyA', 'guest@proof.local', :'userA', 'pending');

-- --- spaces + space_members: a private room in family A, A the only member ---
\set spaceA '00000000-0000-0000-0000-0000000000c1'
INSERT INTO public.spaces (id, kind, voyage_id, created_by)
VALUES (:'spaceA', 'room', :'voyA', :'userA')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.space_members (space_id, user_id, state)
VALUES (:'spaceA', :'userA', 'active')
ON CONFLICT (space_id, user_id) DO NOTHING;

-- --- graph_traverse: two of A's PERSONAL (L1) nodes, an edge between them ----
--     A1 --supports--> A2.  Personal knowledge (user_id=A, voyage_slug NULL) so
--     only A's own scope may traverse it; a B-scoped or unscoped call must not.
\set nodeA1 '00000000-0000-0000-0000-0000000000d1'
\set nodeA2 '00000000-0000-0000-0000-0000000000d2'
INSERT INTO public.knowledge_events (id, user_id, voyage_slug, event_type, content)
VALUES (:'nodeA1', :'userA', NULL, 'explicit', 'A node one'),
       (:'nodeA2', :'userA', NULL, 'explicit', 'A node two')
ON CONFLICT (id) DO NOTHING;
-- Force the exact knowledge_current state the traversal reads (independent of
-- any enrichment trigger): both nodes personal, above the attention floor.
INSERT INTO public.knowledge_current
  (event_id, user_id, voyage_slug, content, event_type, knowledge_type, attention_score, participants, source_created_at)
VALUES
  (:'nodeA1', :'userA', NULL, 'A node one', 'explicit', 'domain', 0.9, NULL, NOW()),
  (:'nodeA2', :'userA', NULL, 'A node two', 'explicit', 'domain', 0.9, NULL, NOW())
ON CONFLICT (event_id) DO UPDATE
  SET user_id = EXCLUDED.user_id, voyage_slug = EXCLUDED.voyage_slug,
      event_type = EXCLUDED.event_type, knowledge_type = EXCLUDED.knowledge_type,
      attention_score = EXCLUDED.attention_score, participants = EXCLUDED.participants;
INSERT INTO public.knowledge_edges (source_id, target_id, edge_type)
VALUES (:'nodeA1', :'nodeA2', 'supports')
ON CONFLICT (source_id, target_id, edge_type) DO NOTHING;

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

  -- (c) service_role (app path) still sees every row.
  -- Clear the jwt claims GUC: set_config(..., is_local=TRUE) persists for the
  -- whole transaction and RESET role does NOT clear it, so without this the
  -- service-role path would still carry a prior probe's auth.uid() and no longer
  -- faithfully model the app (auth.uid() = NULL).
  SET LOCAL role service_role;
  PERFORM set_config('request.jwt.claims', '{}', TRUE);
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
  -- Clear the leaked jwt claims from probe (e) (see (c)); otherwise auth.uid()
  -- stays = userB inside the function, the gate fires, and this probe FALSE-FAILS
  -- a correct migration.
  SET LOCAL role service_role;
  PERFORM set_config('request.jwt.claims', '{}', TRUE);
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

  -- (f2) authenticated B (non-member) naming A's voyage  → must be REJECTED.
  --      Identity is honest (p_user_id = B) but B is not a member of fam-a-450,
  --      so the voyage-membership gate must block the L3/L4-NULL leak.
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000b')::text, TRUE);
  raised := FALSE;
  BEGIN
    PERFORM * FROM public.search_knowledge(
      array_fill(0::real, ARRAY[1536])::vector,
      p_user_id => '00000000-0000-0000-0000-00000000000b'::uuid,
      p_voyage_slug => 'fam-a-450');
  EXCEPTION WHEN insufficient_privilege THEN raised := TRUE;
  END;
  RESET role;
  IF raised THEN RAISE NOTICE 'PASS search_knowledge: authenticated non-member voyage query rejected';
  ELSE ok := FALSE; RAISE WARNING 'FAIL search_knowledge: authenticated non-member read another voyage'; END IF;

  -- (f3) authenticated A (member/captain) naming its OWN voyage  → must SUCCEED.
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000a')::text, TRUE);
  raised := FALSE;
  BEGIN
    PERFORM * FROM public.search_knowledge(
      array_fill(0::real, ARRAY[1536])::vector,
      p_user_id => '00000000-0000-0000-0000-00000000000a'::uuid,
      p_voyage_slug => 'fam-a-450');
  EXCEPTION WHEN OTHERS THEN raised := TRUE;
  END;
  RESET role;
  IF NOT raised THEN RAISE NOTICE 'PASS search_knowledge: member self-query in own voyage allowed';
  ELSE ok := FALSE; RAISE WARNING 'FAIL search_knowledge: member self-query in own voyage was rejected'; END IF;

  -- ===========================================================================
  -- spaces: member-only for authenticated; full for service_role
  -- ===========================================================================

  -- (g) authenticated B (non-member) must NOT see A's space
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000b')::text, TRUE);
  SELECT count(*) INTO n FROM public.spaces
    WHERE id = '00000000-0000-0000-0000-0000000000c1';
  RESET role;
  IF n = 0 THEN RAISE NOTICE 'PASS spaces: authenticated non-member sees 0 of A''s spaces';
  ELSE ok := FALSE; RAISE WARNING 'FAIL spaces: authenticated non-member saw % of A''s spaces', n; END IF;

  -- (h) authenticated A (member) DOES see its own space
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000a')::text, TRUE);
  SELECT count(*) INTO n FROM public.spaces
    WHERE id = '00000000-0000-0000-0000-0000000000c1';
  RESET role;
  IF n = 1 THEN RAISE NOTICE 'PASS spaces: authenticated member sees its own space';
  ELSE ok := FALSE; RAISE WARNING 'FAIL spaces: authenticated member could not see its own space (saw %)', n; END IF;

  -- ===========================================================================
  -- space_members: co-member-only roster for authenticated
  -- ===========================================================================

  -- (i) authenticated B (non-member) must NOT read A's room roster
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000b')::text, TRUE);
  SELECT count(*) INTO n FROM public.space_members
    WHERE space_id = '00000000-0000-0000-0000-0000000000c1';
  RESET role;
  IF n = 0 THEN RAISE NOTICE 'PASS space_members: authenticated non-member sees 0 of A''s roster';
  ELSE ok := FALSE; RAISE WARNING 'FAIL space_members: authenticated non-member saw % roster rows', n; END IF;

  -- (j) authenticated A (member) DOES see its own membership row
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000a')::text, TRUE);
  SELECT count(*) INTO n FROM public.space_members
    WHERE space_id = '00000000-0000-0000-0000-0000000000c1';
  RESET role;
  IF n >= 1 THEN RAISE NOTICE 'PASS space_members: authenticated member sees its own roster';
  ELSE ok := FALSE; RAISE WARNING 'FAIL space_members: authenticated member could not see its own roster'; END IF;

  -- ===========================================================================
  -- voyage_invites: captain-only for authenticated
  -- ===========================================================================

  -- (k) authenticated B (non-captain) must NOT read A's invitee emails
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000b')::text, TRUE);
  SELECT count(*) INTO n FROM public.voyage_invites
    WHERE voyage_id = '00000000-0000-0000-0000-0000000000a1';
  RESET role;
  IF n = 0 THEN RAISE NOTICE 'PASS voyage_invites: authenticated non-captain sees 0 invitee emails';
  ELSE ok := FALSE; RAISE WARNING 'FAIL voyage_invites: authenticated non-captain saw % invitee emails', n; END IF;

  -- (l) authenticated A (captain) DOES see its own voyage's invites
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000a')::text, TRUE);
  SELECT count(*) INTO n FROM public.voyage_invites
    WHERE voyage_id = '00000000-0000-0000-0000-0000000000a1';
  RESET role;
  IF n >= 1 THEN RAISE NOTICE 'PASS voyage_invites: captain sees own voyage''s invites';
  ELSE ok := FALSE; RAISE WARNING 'FAIL voyage_invites: captain could not see own voyage''s invites'; END IF;

  -- ===========================================================================
  -- graph_traverse: caller-scoped. RLS cannot reach it (admin client), so the
  -- p_user_id/p_voyage_slug/p_participants args + knowledge_in_scope() are the
  -- boundary. Called directly (no role switch) — scoping is arg-driven.
  -- ===========================================================================

  -- (m) A-scoped traversal from A1 sees A's own connected node A2
  SELECT count(*) INTO n FROM public.graph_traverse(
    '00000000-0000-0000-0000-0000000000d1'::uuid,
    NULL, 'both', 2, 0.3, 50,
    p_user_id => '00000000-0000-0000-0000-00000000000a'::uuid,
    p_voyage_slug => NULL,
    p_participants => ARRAY['00000000-0000-0000-0000-00000000000a'::uuid]);
  IF n >= 1 THEN RAISE NOTICE 'PASS graph_traverse: A-scoped traversal sees A''s in-scope node';
  ELSE ok := FALSE; RAISE WARNING 'FAIL graph_traverse: A-scoped traversal saw no in-scope node'; END IF;

  -- (n) B-scoped traversal from A1 must see NOTHING (A's nodes are personal)
  SELECT count(*) INTO n FROM public.graph_traverse(
    '00000000-0000-0000-0000-0000000000d1'::uuid,
    NULL, 'both', 2, 0.3, 50,
    p_user_id => '00000000-0000-0000-0000-00000000000b'::uuid,
    p_voyage_slug => NULL,
    p_participants => ARRAY['00000000-0000-0000-0000-00000000000b'::uuid]);
  IF n = 0 THEN RAISE NOTICE 'PASS graph_traverse: B-scoped traversal sees 0 of A''s nodes';
  ELSE ok := FALSE; RAISE WARNING 'FAIL graph_traverse: B-scoped traversal saw % of A''s nodes', n; END IF;

  -- (o) unscoped (all scope args NULL) must deny by default → NOTHING
  SELECT count(*) INTO n FROM public.graph_traverse(
    '00000000-0000-0000-0000-0000000000d1'::uuid,
    NULL, 'both', 2, 0.3, 50);
  IF n = 0 THEN RAISE NOTICE 'PASS graph_traverse: unscoped call denies by default (0 rows)';
  ELSE ok := FALSE; RAISE WARNING 'FAIL graph_traverse: unscoped call leaked % rows', n; END IF;

  -- ===========================================================================
  -- EXECUTE-surface lockdown. The gates above assume the WRONG role cannot even
  -- reach these functions. Prove that at the grant layer — these fire before any
  -- row work, so they are deterministic regardless of seed/embedding state.
  -- ===========================================================================

  -- (p) anon (the public key, auth.uid() = NULL) must NOT be able to EXECUTE
  --     search_knowledge. This is the exact hole 051's REVOKE ... FROM PUBLIC
  --     closes: a function's default grant is EXECUTE TO PUBLIC (which includes
  --     anon), and anon's auth.uid() is NULL just like the trusted service-role
  --     path — so without the REVOKE, the conditional guard is SKIPPED for anon
  --     and a forged p_user_id reads cross-family. Denial is at the grant layer.
  SET LOCAL role anon;
  raised := FALSE;
  BEGIN
    PERFORM * FROM public.search_knowledge(
      array_fill(0::real, ARRAY[1536])::vector,
      p_user_id => '00000000-0000-0000-0000-00000000000a'::uuid);
  EXCEPTION WHEN insufficient_privilege THEN raised := TRUE;
  END;
  RESET role;
  IF raised THEN RAISE NOTICE 'PASS search_knowledge: anon cannot EXECUTE (REVOKE FROM PUBLIC holds)';
  ELSE ok := FALSE; RAISE WARNING 'FAIL search_knowledge: anon executed it — PUBLIC EXECUTE not revoked (cross-family leak open)'; END IF;

  -- (q) graph_traverse is GRANTed to service_role ONLY. An authenticated REST
  --     caller must NOT be able to EXECUTE it — otherwise arg-driven scoping is
  --     the only thing between a forged-arg caller and the graph. Proves the
  --     REVOKE FROM PUBLIC / GRANT service_role lockdown, not just the scoping.
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000b')::text, TRUE);
  raised := FALSE;
  BEGIN
    PERFORM * FROM public.graph_traverse(
      '00000000-0000-0000-0000-0000000000d1'::uuid,
      NULL, 'both', 2, 0.3, 50,
      p_user_id => '00000000-0000-0000-0000-00000000000b'::uuid);
  EXCEPTION WHEN insufficient_privilege THEN raised := TRUE;
  END;
  RESET role;
  IF raised THEN RAISE NOTICE 'PASS graph_traverse: authenticated caller cannot EXECUTE (service_role only)';
  ELSE ok := FALSE; RAISE WARNING 'FAIL graph_traverse: authenticated caller executed it — not locked to service_role'; END IF;

  -- (r) …and anon cannot EXECUTE graph_traverse either.
  SET LOCAL role anon;
  PERFORM set_config('request.jwt.claims', '{}', TRUE);
  raised := FALSE;
  BEGIN
    PERFORM * FROM public.graph_traverse(
      '00000000-0000-0000-0000-0000000000d1'::uuid,
      NULL, 'both', 2, 0.3, 50,
      p_user_id => '00000000-0000-0000-0000-00000000000a'::uuid);
  EXCEPTION WHEN insufficient_privilege THEN raised := TRUE;
  END;
  RESET role;
  IF raised THEN RAISE NOTICE 'PASS graph_traverse: anon cannot EXECUTE';
  ELSE ok := FALSE; RAISE WARNING 'FAIL graph_traverse: anon executed it'; END IF;

  -- ===========================================================================
  IF ok THEN RAISE NOTICE 'ALL PASS';
  ELSE RAISE EXCEPTION 'PROOF FAILED — see WARNINGs above';
  END IF;
END
$proof$;

ROLLBACK;  -- proof is non-destructive; seed rows are discarded.
