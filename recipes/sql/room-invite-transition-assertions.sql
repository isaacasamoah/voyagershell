INSERT INTO auth.users(id) VALUES
  ('10000000-0000-4000-8000-000000000033'),
  ('10000000-0000-4000-8000-000000000034');
UPDATE public.profiles SET
  display_name = CASE WHEN id = '10000000-0000-4000-8000-000000000033'
    THEN 'Fresh Inviter' ELSE 'Fresh Invitee' END
WHERE id IN (
  '10000000-0000-4000-8000-000000000033',
  '10000000-0000-4000-8000-000000000034'
);
INSERT INTO public.voyage_members(id, voyage_id, user_id) VALUES
  ('40000000-0000-4000-8000-000000000033',
    '20000000-0000-4000-8000-000000000031',
    '10000000-0000-4000-8000-000000000033'),
  ('40000000-0000-4000-8000-000000000034',
    '20000000-0000-4000-8000-000000000031',
    '10000000-0000-4000-8000-000000000034');
INSERT INTO public.sessions(id, user_id, status, voyage_id) VALUES (
  '50000000-0000-4000-8000-000000000033',
  '10000000-0000-4000-8000-000000000033',
  'active',
  '20000000-0000-4000-8000-000000000031'
);
-- The invitee answers from a browser that has been open across a /new: the
-- session the knock was rendered in is already historical, and the live
-- conversation is a different, unbound row.
INSERT INTO public.sessions(id, user_id, status, voyage_id) VALUES
  ('50000000-0000-4000-8000-000000000035',
   '10000000-0000-4000-8000-000000000034', 'historical',
   '20000000-0000-4000-8000-000000000031'),
  ('50000000-0000-4000-8000-000000000036',
   '10000000-0000-4000-8000-000000000034', 'active',
   '20000000-0000-4000-8000-000000000031');

DO $$
DECLARE
  forged_result record;
  first_result record;
  missing_result record;
  repeated_result record;
  active_result record;
  reinvite_result record;
BEGIN
  PERFORM set_config(
    'request.jwt.claim.sub',
    '10000000-0000-4000-8000-000000000034',
    true
  );
  SELECT * INTO forged_result FROM public.create_room_invite(
    '50000000-0000-4000-8000-000000000033',
    '10000000-0000-4000-8000-000000000033',
    '10000000-0000-4000-8000-000000000034'
  );
  IF forged_result.invite_status <> 'denied'
      OR forged_result.invite_space_id IS NOT NULL THEN
    RAISE EXCEPTION 'forged inviter identity was accepted';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT * INTO first_result FROM public.create_room_invite(
    '50000000-0000-4000-8000-000000000033',
    '10000000-0000-4000-8000-000000000033',
    '10000000-0000-4000-8000-000000000034'
  );
  IF first_result.invite_status <> 'invited' OR first_result.invite_space_id IS NULL THEN
    RAISE EXCEPTION 'first invite did not commit an invited membership';
  END IF;
  IF (SELECT space_id FROM public.sessions
      WHERE id = '50000000-0000-4000-8000-000000000033')
      IS DISTINCT FROM first_result.invite_space_id
      OR NOT EXISTS (SELECT 1 FROM public.space_members
        WHERE space_id = first_result.invite_space_id
          AND user_id = '10000000-0000-4000-8000-000000000033'
          AND state = 'active')
      OR NOT EXISTS (SELECT 1 FROM public.space_members
        WHERE space_id = first_result.invite_space_id
          AND user_id = '10000000-0000-4000-8000-000000000034'
          AND state = 'invited') THEN
    RAISE EXCEPTION 'first invite committed an incomplete room';
  END IF;

  SELECT * INTO missing_result FROM public.transition_room_invite(
    '50000000-0000-4000-8000-000000000033',
    '10000000-0000-4000-8000-000000000034',
    NULL,
    'accept'
  );
  IF missing_result.transition_status <> 'no_pending_invite'
      OR missing_result.transition_space_id IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM public.space_members
        WHERE space_id = first_result.invite_space_id
          AND user_id = '10000000-0000-4000-8000-000000000034'
          AND state = 'invited') THEN
    RAISE EXCEPTION 'missing room identity selected a pending invite';
  END IF;

  SELECT * INTO repeated_result FROM public.create_room_invite(
    '50000000-0000-4000-8000-000000000033',
    '10000000-0000-4000-8000-000000000033',
    '10000000-0000-4000-8000-000000000034'
  );
  IF repeated_result.invite_status <> 'invited'
      OR repeated_result.invite_space_id IS DISTINCT FROM first_result.invite_space_id THEN
    RAISE EXCEPTION 'invited re-invite was not idempotent';
  END IF;

  UPDATE public.space_members SET state = 'active'
  WHERE space_id = first_result.invite_space_id
    AND user_id = '10000000-0000-4000-8000-000000000034';
  SELECT * INTO active_result FROM public.create_room_invite(
    '50000000-0000-4000-8000-000000000033',
    '10000000-0000-4000-8000-000000000033',
    '10000000-0000-4000-8000-000000000034'
  );
  IF active_result.invite_status <> 'active'
      OR active_result.invite_space_id IS DISTINCT FROM first_result.invite_space_id THEN
    RAISE EXCEPTION 'active re-invite was not idempotent';
  END IF;

  UPDATE public.space_members SET state = 'left'
  WHERE space_id = first_result.invite_space_id
    AND user_id = '10000000-0000-4000-8000-000000000034';
  SELECT * INTO reinvite_result FROM public.create_room_invite(
    '50000000-0000-4000-8000-000000000033',
    '10000000-0000-4000-8000-000000000033',
    '10000000-0000-4000-8000-000000000034'
  );
  IF reinvite_result.invite_status <> 'invited'
      OR reinvite_result.invite_space_id IS DISTINCT FROM first_result.invite_space_id
      OR NOT EXISTS (SELECT 1 FROM public.space_members
        WHERE space_id = first_result.invite_space_id
          AND user_id = '10000000-0000-4000-8000-000000000034'
          AND state = 'invited') THEN
    RAISE EXCEPTION 'left member was not re-invited in place';
  END IF;
END
$$;

-- Remove-then-rejoin convergence. Accepting binds the LIVE conversation, never
-- the historical session the knock happened to be rendered in.
DO $rejoin$
DECLARE
  rejoin_space uuid;
  rejoin_result record;
BEGIN
  SELECT space_id
  INTO rejoin_space
  FROM public.sessions
  WHERE id = '50000000-0000-4000-8000-000000000033';

  -- The exact shape observed on the bench: the conversation the member was
  -- removed from KEEPS its pointer at the room (retained as location/history)
  -- and has since gone historical, while the live conversation is unbound.
  UPDATE public.sessions
  SET space_id = rejoin_space
  WHERE id = '50000000-0000-4000-8000-000000000035';

  SELECT * INTO rejoin_result FROM public.transition_room_invite(
    '50000000-0000-4000-8000-000000000035',
    '10000000-0000-4000-8000-000000000034',
    rejoin_space,
    'accept'
  );

  IF rejoin_result.transition_status <> 'accepted'
      OR rejoin_result.transition_space_id IS DISTINCT FROM rejoin_space
      OR NOT EXISTS (SELECT 1 FROM public.space_members
        WHERE space_id = rejoin_space
          AND user_id = '10000000-0000-4000-8000-000000000034'
          AND state = 'active') THEN
    RAISE EXCEPTION 'rejoin from a historical session was not accepted';
  END IF;
  IF (SELECT space_id FROM public.sessions
      WHERE id = '50000000-0000-4000-8000-000000000036')
      IS DISTINCT FROM rejoin_space THEN
    RAISE EXCEPTION 'rejoin did not bind the live session';
  END IF;
  IF (SELECT count(*) FROM public.sessions
      WHERE user_id = '10000000-0000-4000-8000-000000000034'
        AND status <> 'active'
        AND space_id = rejoin_space) <> 1 THEN
    RAISE EXCEPTION 'rejoin spread the room across historical sessions';
  END IF;
END
$rejoin$;

-- With no live conversation there is nowhere for the room to become visible.
-- The whole transition rolls back rather than half-committing membership.
DO $no_live_session$
DECLARE
  orphan_space uuid;
BEGIN
  SELECT space_id
  INTO orphan_space
  FROM public.sessions
  WHERE id = '50000000-0000-4000-8000-000000000036';

  UPDATE public.space_members SET state = 'invited'
  WHERE space_id = orphan_space
    AND user_id = '10000000-0000-4000-8000-000000000034';
  UPDATE public.sessions SET status = 'historical', space_id = NULL
  WHERE id = '50000000-0000-4000-8000-000000000036';

  BEGIN
    PERFORM public.transition_room_invite(
      '50000000-0000-4000-8000-000000000035',
      '10000000-0000-4000-8000-000000000034',
      orphan_space,
      'accept'
    );
    RAISE EXCEPTION 'accept without a live session was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  IF (SELECT state FROM public.space_members
      WHERE space_id = orphan_space
        AND user_id = '10000000-0000-4000-8000-000000000034')
      IS DISTINCT FROM 'invited' THEN
    RAISE EXCEPTION 'refused accept still changed membership';
  END IF;
END
$no_live_session$;
