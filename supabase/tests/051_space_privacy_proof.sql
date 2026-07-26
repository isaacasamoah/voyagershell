-- Space, roster and invite privacy backstop. Runs after installed migrations 054-059.
BEGIN;
SET client_min_messages = warning;

\set userA '00000000-0000-0000-0000-00000000000a'
\set userB '00000000-0000-0000-0000-00000000000b'
\set voyA '00000000-0000-0000-0000-0000000000a1'
\set spaceA '00000000-0000-0000-0000-0000000000c1'

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
INSERT INTO public.voyage_invites (voyage_id, email, invited_by, status)
VALUES (:'voyA', 'guest@proof.local', :'userA', 'pending');
INSERT INTO public.spaces (id, kind, voyage_id, created_by)
VALUES (:'spaceA', 'room', :'voyA', :'userA')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.space_members (space_id, user_id, state)
VALUES (:'spaceA', :'userA', 'active')
ON CONFLICT (space_id, user_id) DO NOTHING;

DO $proof$
DECLARE
  n INT;
  ok BOOLEAN := TRUE;
BEGIN
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000b')::text, TRUE);
  SELECT count(*) INTO n FROM public.spaces
    WHERE id = '00000000-0000-0000-0000-0000000000c1';
  RESET role;
  IF n <> 0 THEN ok := FALSE; RAISE WARNING 'space leaked to non-member'; END IF;

  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000a')::text, TRUE);
  SELECT count(*) INTO n FROM public.spaces
    WHERE id = '00000000-0000-0000-0000-0000000000c1';
  RESET role;
  IF n <> 1 THEN ok := FALSE; RAISE WARNING 'space hidden from member'; END IF;

  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000b')::text, TRUE);
  SELECT count(*) INTO n FROM public.space_members
    WHERE space_id = '00000000-0000-0000-0000-0000000000c1';
  RESET role;
  IF n <> 0 THEN ok := FALSE; RAISE WARNING 'roster leaked to non-member'; END IF;

  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000a')::text, TRUE);
  SELECT count(*) INTO n FROM public.space_members
    WHERE space_id = '00000000-0000-0000-0000-0000000000c1';
  RESET role;
  IF n < 1 THEN ok := FALSE; RAISE WARNING 'roster hidden from member'; END IF;

  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000b')::text, TRUE);
  SELECT count(*) INTO n FROM public.voyage_invites
    WHERE voyage_id = '00000000-0000-0000-0000-0000000000a1';
  RESET role;
  IF n <> 0 THEN ok := FALSE; RAISE WARNING 'invite leaked to non-captain'; END IF;

  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000a')::text, TRUE);
  SELECT count(*) INTO n FROM public.voyage_invites
    WHERE voyage_id = '00000000-0000-0000-0000-0000000000a1';
  RESET role;
  IF n < 1 THEN ok := FALSE; RAISE WARNING 'invite hidden from captain'; END IF;

  IF NOT ok THEN RAISE EXCEPTION 'SPACE PRIVACY PROOF FAILED'; END IF;
END
$proof$;

ROLLBACK;
