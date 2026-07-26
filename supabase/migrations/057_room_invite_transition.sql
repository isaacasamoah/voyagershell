-- Pre-cutover invitation events did not identify their room. Retire every
-- pending membership while the new exact-room response authority is installed;
-- the immutable events remain history and a sender can create a fresh invite.
UPDATE public.space_members
SET state = 'left'
WHERE state = 'invited';

CREATE FUNCTION public.transition_room_invite(
  p_session_id uuid,
  p_user_id uuid,
  p_space_id uuid,
  p_action text
)
RETURNS TABLE(transition_status text, transition_space_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_session public.sessions;
  v_space_id uuid;
  v_space public.spaces;
  v_parent_state text;
  v_member_state text;
BEGIN
  IF p_action NOT IN ('accept', 'decline') THEN
    RAISE EXCEPTION 'room_invite_action_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_space_id IS NULL THEN
    RETURN QUERY SELECT 'no_pending_invite'::text, NULL::uuid;
    RETURN;
  END IF;

  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'room_invite_user_mismatch' USING ERRCODE = '42501';
  END IF;

  -- p_session_id is the caller's claim about WHERE they answered the knock. It
  -- proves ownership and names the voyage the answer belongs to. It is NEVER
  -- the row that records the room: a knock stays on screen across /new, a
  -- resume, or a second tab, so by the time Join is pressed that session may
  -- already be historical.
  SELECT *
  INTO v_session
  FROM public.sessions session
  WHERE session.id = p_session_id
    AND session.user_id = p_user_id;

  IF v_session.id IS NULL THEN
    RETURN QUERY SELECT 'denied'::text, NULL::uuid;
    RETURN;
  END IF;

  -- The same (user, voyage) session-set key get_or_create_active_session and
  -- resume_session take. Entering a room decides which of this person's
  -- conversations is in it, so it must not race a concurrent /new or resume
  -- that redefines which conversation is live.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_user_id::text || ':' || coalesce(v_session.voyage_id::text, 'personal'), 0));

  SELECT *
  INTO v_session
  FROM public.sessions session
  WHERE session.id = p_session_id
    AND session.user_id = p_user_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RETURN QUERY SELECT 'denied'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT member.space_id
  INTO v_space_id
  FROM public.space_members member
  JOIN public.spaces space ON space.id = member.space_id
  WHERE member.user_id = p_user_id
    AND member.space_id = p_space_id
    AND (
      (p_action = 'decline' AND member.state = 'invited')
      OR (
        p_action = 'accept'
        AND (
          member.state = 'invited'
          OR (
            member.state = 'active'
            AND member.space_id IS DISTINCT FROM v_session.space_id
          )
        )
      )
    )
    AND space.voyage_id IS NOT DISTINCT FROM v_session.voyage_id
  LIMIT 1;

  IF v_space_id IS NULL THEN
    RETURN QUERY SELECT 'no_pending_invite'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT *
  INTO v_space
  FROM public.spaces space
  WHERE space.id = v_space_id
  FOR SHARE;

  IF v_space.id IS NULL OR v_space.voyage_id IS DISTINCT FROM v_session.voyage_id THEN
    RETURN QUERY SELECT 'denied'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_space.voyage_id IS NOT NULL THEN
    SELECT parent.state
    INTO v_parent_state
    FROM public.voyage_members parent
    WHERE parent.voyage_id = v_space.voyage_id
      AND parent.user_id = p_user_id
    FOR UPDATE;

    IF v_parent_state IS DISTINCT FROM 'active' THEN
      RETURN QUERY SELECT 'denied'::text, NULL::uuid;
      RETURN;
    END IF;
  END IF;

  SELECT member.state
  INTO v_member_state
  FROM public.space_members member
  WHERE member.space_id = v_space_id
    AND member.user_id = p_user_id
  FOR UPDATE;

  IF (p_action = 'decline' AND v_member_state IS DISTINCT FROM 'invited')
      OR (p_action = 'accept' AND v_member_state NOT IN ('invited', 'active')) THEN
    RETURN QUERY SELECT 'no_pending_invite'::text, NULL::uuid;
    RETURN;
  END IF;

  IF p_action = 'decline' THEN
    UPDATE public.space_members
    SET state = 'left'
    WHERE space_id = v_space_id
      AND user_id = p_user_id;

    RETURN QUERY SELECT 'declined'::text, v_space_id;
    RETURN;
  END IF;

  IF p_action = 'accept' AND v_member_state = 'invited' THEN
    UPDATE public.space_members
    SET state = 'active'
    WHERE space_id = v_space_id
      AND user_id = p_user_id;
  END IF;

  IF NOT public.is_effective_space_member(v_space_id, p_user_id) THEN
    RAISE EXCEPTION 'room_invite_authority_changed' USING ERRCODE = '42501';
  END IF;

  -- Membership is the authority; the LIVE conversation is where that room
  -- becomes visible. Bind every active session this person holds in the room's
  -- voyage — never p_session_id, whose row may already be historical, which is
  -- exactly how a rejoin left both people active members of a room neither
  -- could see. One active session per voyage is the invariant every session
  -- function enforces, so this is exactly one row; should that invariant ever
  -- break, every live conversation converges on the same room instead of an
  -- arbitrary row winning.
  UPDATE public.sessions
  SET space_id = v_space_id
  WHERE user_id = p_user_id
    AND status = 'active'
    AND voyage_id IS NOT DISTINCT FROM v_space.voyage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_invite_live_session_missing' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    CASE WHEN v_member_state = 'invited' THEN 'accepted' ELSE 'entered' END,
    v_space_id;
END
$$;

REVOKE ALL ON FUNCTION public.transition_room_invite(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_room_invite(uuid, uuid, uuid, text)
  TO service_role;
