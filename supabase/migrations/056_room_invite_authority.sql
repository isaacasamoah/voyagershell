CREATE FUNCTION public.create_room_invite(
  p_session_id uuid,
  p_inviter_user_id uuid,
  p_invitee_user_id uuid
)
RETURNS TABLE(invite_status text, invite_space_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_session public.sessions;
  v_space public.spaces;
  v_member_state text;
BEGIN
  IF p_invitee_user_id IS NULL
      OR p_invitee_user_id = p_inviter_user_id
      OR (auth.uid() IS NOT NULL AND p_inviter_user_id IS DISTINCT FROM auth.uid()) THEN
    RETURN QUERY SELECT 'denied'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT *
  INTO v_session
  FROM public.sessions session
  WHERE session.id = p_session_id
    AND session.user_id = p_inviter_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'denied'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_session.space_id IS NULL THEN
    IF v_session.voyage_id IS NOT NULL THEN
      PERFORM parent.id
      FROM public.voyage_members parent
      WHERE parent.voyage_id = v_session.voyage_id
        AND parent.user_id IN (p_inviter_user_id, p_invitee_user_id)
      ORDER BY parent.id
      FOR UPDATE;

      IF (
        SELECT count(*)
        FROM public.voyage_members parent
        WHERE parent.voyage_id = v_session.voyage_id
          AND parent.user_id IN (p_inviter_user_id, p_invitee_user_id)
          AND parent.state = 'active'
      ) <> 2 THEN
        RETURN QUERY SELECT 'denied'::text, NULL::uuid;
        RETURN;
      END IF;
    END IF;

    INSERT INTO public.spaces(voyage_id, created_by)
    VALUES (v_session.voyage_id, p_inviter_user_id)
    RETURNING *
    INTO v_space;

    INSERT INTO public.space_members(space_id, user_id, state)
    VALUES (v_space.id, p_inviter_user_id, 'active');

    UPDATE public.sessions
    SET space_id = v_space.id
    WHERE id = v_session.id;
  ELSE
    SELECT *
    INTO v_space
    FROM public.spaces space
    WHERE space.id = v_session.space_id
      AND space.voyage_id IS NOT DISTINCT FROM v_session.voyage_id
    FOR SHARE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT 'denied'::text, v_session.space_id;
      RETURN;
    END IF;

    IF v_space.voyage_id IS NOT NULL THEN
      PERFORM parent.id
      FROM public.voyage_members parent
      WHERE parent.voyage_id = v_space.voyage_id
        AND parent.user_id IN (p_inviter_user_id, p_invitee_user_id)
      ORDER BY parent.id
      FOR UPDATE;

      IF (
        SELECT count(*)
        FROM public.voyage_members parent
        WHERE parent.voyage_id = v_space.voyage_id
          AND parent.user_id IN (p_inviter_user_id, p_invitee_user_id)
          AND parent.state = 'active'
      ) <> 2 THEN
        RETURN QUERY SELECT 'denied'::text, v_space.id;
        RETURN;
      END IF;
    END IF;

    SELECT member.state
    INTO v_member_state
    FROM public.space_members member
    WHERE member.space_id = v_space.id
      AND member.user_id = p_inviter_user_id
    FOR UPDATE;

    IF v_member_state IS DISTINCT FROM 'active' THEN
      RETURN QUERY SELECT 'denied'::text, v_space.id;
      RETURN;
    END IF;
  END IF;

  SELECT member.state
  INTO v_member_state
  FROM public.space_members member
  WHERE member.space_id = v_space.id
    AND member.user_id = p_invitee_user_id
  FOR UPDATE;

  IF v_member_state = 'active' THEN
    RETURN QUERY SELECT 'active'::text, v_space.id;
    RETURN;
  END IF;

  IF v_member_state = 'left' THEN
    UPDATE public.space_members
    SET state = 'invited'
    WHERE space_id = v_space.id
      AND user_id = p_invitee_user_id;
  ELSIF v_member_state IS NULL THEN
    INSERT INTO public.space_members(space_id, user_id, state)
    VALUES (v_space.id, p_invitee_user_id, 'invited');
  END IF;

  RETURN QUERY SELECT 'invited'::text, v_space.id;
END
$$;

REVOKE ALL ON FUNCTION public.create_room_invite(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_invite(uuid, uuid, uuid)
  TO service_role;
