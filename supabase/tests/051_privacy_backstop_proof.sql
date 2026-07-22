-- ORU-450 retrieval/search privacy backstop. Active after graph migration 057.
-- Graph privacy is proven by recipes/knowledge-graph-poc.sh against 054-057.
BEGIN;
SET client_min_messages = warning;

\set userA '00000000-0000-0000-0000-00000000000a'
\set userB '00000000-0000-0000-0000-00000000000b'
\set voyA '00000000-0000-0000-0000-0000000000a1'

INSERT INTO public.retrieval_events (user_id, query, nodes_returned)
VALUES (:'userA', 'family A private query', ARRAY[]::uuid[]),
       (:'userB', 'family B private query', ARRAY[]::uuid[]);
INSERT INTO auth.users (id, email)
VALUES (:'userA', 'a-450@proof.local'), (:'userB', 'b-450@proof.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, display_name)
VALUES (:'userA', 'a-450@proof.local', 'Family A'),
       (:'userB', 'b-450@proof.local', 'Family B')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.voyages (id, slug, name)
VALUES (:'voyA', 'fam-a-450', 'Family A Voyage')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.voyage_members (voyage_id, user_id, role)
VALUES (:'voyA', :'userA', 'captain')
ON CONFLICT (voyage_id, user_id) DO NOTHING;

DO $proof$
DECLARE
  n INT;
  ok BOOLEAN := TRUE;
  raised BOOLEAN;
BEGIN
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000b')::text, TRUE);
  SELECT count(*) INTO n FROM public.retrieval_events
    WHERE user_id = '00000000-0000-0000-0000-00000000000a';
  RESET role;
  IF n <> 0 THEN ok := FALSE; RAISE WARNING 'retrieval_events leaked A to B'; END IF;

  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000b')::text, TRUE);
  SELECT count(*) INTO n FROM public.retrieval_events
    WHERE user_id = '00000000-0000-0000-0000-00000000000b';
  RESET role;
  IF n < 1 THEN ok := FALSE; RAISE WARNING 'retrieval_events hid B from B'; END IF;

  SET LOCAL role service_role;
  PERFORM set_config('request.jwt.claims', '{}', TRUE);
  SELECT count(*) INTO n FROM public.retrieval_events;
  RESET role;
  IF n < 2 THEN ok := FALSE; RAISE WARNING 'service retrieval path regressed'; END IF;

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
  IF NOT raised THEN ok := FALSE; RAISE WARNING 'forged search identity accepted'; END IF;

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
  IF raised THEN ok := FALSE; RAISE WARNING 'honest self search rejected'; END IF;

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
  IF raised THEN ok := FALSE; RAISE WARNING 'service search path regressed'; END IF;

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
  IF NOT raised THEN ok := FALSE; RAISE WARNING 'non-member voyage search accepted'; END IF;

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
  IF raised THEN ok := FALSE; RAISE WARNING 'member voyage search rejected'; END IF;

  SET LOCAL role anon;
  raised := FALSE;
  BEGIN
    PERFORM * FROM public.search_knowledge(
      array_fill(0::real, ARRAY[1536])::vector,
      p_user_id => '00000000-0000-0000-0000-00000000000a'::uuid);
  EXCEPTION WHEN insufficient_privilege THEN raised := TRUE;
  END;
  RESET role;
  IF NOT raised THEN ok := FALSE; RAISE WARNING 'anon search execute accepted'; END IF;

  IF NOT ok THEN RAISE EXCEPTION 'RETRIEVAL PRIVACY PROOF FAILED'; END IF;
END
$proof$;

ROLLBACK;
