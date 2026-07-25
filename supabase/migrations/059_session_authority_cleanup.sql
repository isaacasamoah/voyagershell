DROP FUNCTION IF EXISTS public.get_or_create_active_session(uuid); DROP FUNCTION IF EXISTS public.get_resumable_sessions(uuid, integer);
DROP FUNCTION IF EXISTS public.resume_session(uuid); DROP FUNCTION IF EXISTS public.resume_session(uuid, uuid);
DROP FUNCTION IF EXISTS public.transition_session(uuid, public.session_status); DROP FUNCTION IF EXISTS public.mark_session_extracted(uuid); DROP FUNCTION IF EXISTS public.set_session_title(uuid, text);
CREATE FUNCTION public.authorize_session_scope(p_session_id uuid, p_user_id uuid,
  p_lock boolean DEFAULT false)
RETURNS public.sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_session public.sessions;
BEGIN
  IF p_user_id IS NULL OR (auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'session_access_denied' USING ERRCODE = '42501';
  END IF;
  IF p_lock THEN
    SELECT session.* INTO v_session FROM public.sessions session
    WHERE session.id = p_session_id AND session.user_id = p_user_id FOR UPDATE;
  ELSE
    SELECT session.* INTO v_session FROM public.sessions session
    WHERE session.id = p_session_id AND session.user_id = p_user_id;
  END IF;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'session_access_denied' USING ERRCODE = '42501'; END IF;
  IF v_session.voyage_id IS NOT NULL THEN
    PERFORM member.id FROM public.voyage_members member
    WHERE member.voyage_id = v_session.voyage_id
      AND member.user_id = p_user_id AND member.state = 'active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'session_access_denied' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN v_session;
END $$;
CREATE FUNCTION public.authorize_session_room_capability(p_session_id uuid, p_user_id uuid)
RETURNS public.sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_session public.sessions;
BEGIN
  SELECT * INTO v_session FROM public.authorize_session_scope(p_session_id, p_user_id, true);
  IF v_session.space_id IS NOT NULL THEN
    PERFORM member.id FROM public.spaces space JOIN public.space_members member
      ON member.space_id = space.id WHERE space.id = v_session.space_id
      AND space.voyage_id IS NOT DISTINCT FROM v_session.voyage_id
      AND member.user_id = p_user_id AND member.state = 'active' FOR SHARE OF space, member;
    IF NOT FOUND THEN RAISE EXCEPTION 'session_access_denied' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN v_session;
END $$;
CREATE FUNCTION public.get_session_scope(p_session_id uuid, p_user_id uuid)
RETURNS TABLE(id uuid, user_id uuid, voyage_id uuid, voyage_slug text,
  space_id uuid, status public.session_status) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_session public.sessions;
BEGIN
  SELECT * INTO v_session FROM public.authorize_session_scope(
    p_session_id, p_user_id, false);
  RETURN QUERY SELECT v_session.id, v_session.user_id, v_session.voyage_id,
    voyage.slug, v_session.space_id, v_session.status
  FROM (SELECT 1) present
  LEFT JOIN public.voyages voyage ON voyage.id = v_session.voyage_id;
END $$;
CREATE FUNCTION public.get_or_create_active_session(p_user_id uuid, p_voyage_slug text)
RETURNS TABLE(id uuid, user_id uuid, title text, status public.session_status,
  last_message_at timestamptz, message_count integer, title_generated_at timestamptz,
  extracted_at timestamptz, voyage_id uuid, space_id uuid, created_at timestamptz,
  updated_at timestamptz, voyage_slug text) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_voyage_id uuid; v_session public.sessions;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'session_access_denied'
    USING ERRCODE = '42501'; END IF;
  IF p_voyage_slug IS NOT NULL THEN
    SELECT voyage.id INTO v_voyage_id FROM public.voyages voyage
    JOIN public.voyage_members member ON member.voyage_id = voyage.id
    WHERE voyage.slug = p_voyage_slug AND member.user_id = p_user_id
      AND member.state = 'active' FOR SHARE OF member;
    IF v_voyage_id IS NULL THEN RAISE EXCEPTION 'session_access_denied'
      USING ERRCODE = '42501'; END IF;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_user_id::text || ':' || coalesce(v_voyage_id::text, 'personal'), 0));
  SELECT session.* INTO v_session FROM public.sessions session
  WHERE session.user_id = p_user_id AND session.status = 'active'
    AND session.voyage_id IS NOT DISTINCT FROM v_voyage_id FOR UPDATE;
  IF v_session.id IS NULL THEN
    INSERT INTO public.sessions(user_id, status, voyage_id)
    VALUES (p_user_id, 'active', v_voyage_id) RETURNING * INTO v_session;
  ELSE
    SELECT * INTO v_session FROM public.authorize_session_scope(
      v_session.id, p_user_id, true);
  END IF;
  RETURN QUERY SELECT v_session.id, v_session.user_id, v_session.title,
    v_session.status, v_session.last_message_at, v_session.message_count,
    v_session.title_generated_at, v_session.extracted_at, v_session.voyage_id,
    v_session.space_id, v_session.created_at, v_session.updated_at, p_voyage_slug;
END $$;
CREATE FUNCTION public.get_resumable_sessions(p_user_id uuid, p_voyage_slug text,
  p_limit integer DEFAULT 10)
RETURNS TABLE(id uuid, title text, status public.session_status,
  last_message_at timestamptz, message_count integer, created_at timestamptz,
  voyage_slug text) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_voyage_id uuid;
BEGIN
  IF p_voyage_slug IS NOT NULL THEN
    SELECT voyage.id INTO v_voyage_id FROM public.voyages voyage
    JOIN public.voyage_members member ON member.voyage_id = voyage.id
    WHERE voyage.slug = p_voyage_slug AND member.user_id = p_user_id
      AND member.state = 'active' FOR SHARE OF member;
    IF v_voyage_id IS NULL THEN RAISE EXCEPTION 'session_access_denied' USING ERRCODE = '42501'; END IF;
  END IF;
  PERFORM public.authorize_session_scope(candidate.id, p_user_id, false)
  FROM (SELECT session.id FROM public.sessions session
    WHERE session.user_id = p_user_id AND session.voyage_id IS NOT DISTINCT FROM v_voyage_id
      AND session.status IN ('active', 'historical')
    ORDER BY session.last_message_at DESC
    LIMIT least(greatest(coalesce(p_limit, 10), 1), 100)) candidate;
  RETURN QUERY SELECT session.id, session.title, session.status,
    session.last_message_at, session.message_count, session.created_at, p_voyage_slug
  FROM public.sessions session
  WHERE session.user_id = p_user_id
    AND session.voyage_id IS NOT DISTINCT FROM v_voyage_id
    AND session.status IN ('active', 'historical')
  ORDER BY session.last_message_at DESC
  LIMIT least(greatest(coalesce(p_limit, 10), 1), 100);
END $$;
CREATE FUNCTION public.resume_session(p_session_id uuid, p_user_id uuid)
RETURNS TABLE(id uuid, user_id uuid, title text, status public.session_status,
  last_message_at timestamptz, message_count integer, title_generated_at timestamptz,
  extracted_at timestamptz, voyage_id uuid, space_id uuid, created_at timestamptz,
  updated_at timestamptz, voyage_slug text) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_target public.sessions; v_active_id uuid; v_voyage_id uuid;
BEGIN
  SELECT * INTO v_target FROM public.authorize_session_scope(
    p_session_id, p_user_id, false);
  v_voyage_id := v_target.voyage_id;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_user_id::text || ':' || coalesce(v_voyage_id::text, 'personal'), 0));
  SELECT * INTO v_target FROM public.authorize_session_scope(
    p_session_id, p_user_id, true);
  IF v_target.status = 'archived' THEN RAISE EXCEPTION 'session_access_denied'
    USING ERRCODE = '42501'; END IF;
  FOR v_active_id IN SELECT session.id FROM public.sessions session
    WHERE session.user_id = p_user_id AND session.status = 'active'
      AND session.voyage_id IS NOT DISTINCT FROM v_target.voyage_id
    ORDER BY session.id FOR UPDATE
  LOOP
    PERFORM public.authorize_session_scope(v_active_id, p_user_id, false);
  END LOOP;
  UPDATE public.sessions session SET status = 'historical', updated_at = now()
  WHERE session.user_id = p_user_id AND session.status = 'active'
    AND session.voyage_id IS NOT DISTINCT FROM v_target.voyage_id
    AND session.id <> v_target.id;
  UPDATE public.sessions session SET status = 'active', updated_at = now()
  WHERE session.id = v_target.id;
  RETURN QUERY SELECT session.id, session.user_id, session.title, session.status,
    session.last_message_at, session.message_count, session.title_generated_at,
    session.extracted_at, session.voyage_id, session.space_id, session.created_at,
    session.updated_at, voyage.slug
  FROM public.sessions session
  LEFT JOIN public.voyages voyage ON voyage.id = session.voyage_id
  WHERE session.id = v_target.id;
END $$;
CREATE FUNCTION public.archive_session(p_session_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_target public.sessions; v_voyage_id uuid;
BEGIN
  SELECT * INTO v_target FROM public.authorize_session_scope(p_session_id, p_user_id, false);
  v_voyage_id := v_target.voyage_id;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_user_id::text || ':' || coalesce(v_voyage_id::text, 'personal'), 0));
  PERFORM public.authorize_session_scope(p_session_id, p_user_id, true);
  UPDATE public.sessions SET status = 'historical', updated_at = now()
  WHERE id = p_session_id AND status <> 'archived';
  RETURN FOUND;
END $$;
CREATE FUNCTION public.touch_session_activity(p_session_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.authorize_session_scope(p_session_id, p_user_id, true);
  UPDATE public.sessions SET last_message_at = now(), updated_at = now()
  WHERE id = p_session_id;
  RETURN FOUND;
END $$;
CREATE FUNCTION public.get_last_active_voyage_slug(p_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_session_id uuid; v_slug text;
BEGIN
  SELECT session.id, voyage.slug INTO v_session_id, v_slug FROM public.sessions session
  JOIN public.voyages voyage ON voyage.id = session.voyage_id
  JOIN public.voyage_members member ON member.voyage_id = voyage.id
    AND member.user_id = p_user_id AND member.state = 'active'
  WHERE session.user_id = p_user_id AND session.status = 'active'
  ORDER BY session.updated_at DESC LIMIT 1;
  IF v_session_id IS NOT NULL THEN PERFORM public.authorize_session_scope(
    v_session_id, p_user_id, false); END IF;
  RETURN v_slug;
END $$;
CREATE FUNCTION public.set_session_ai_presence(p_session_id uuid, p_user_id uuid,
  p_present boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_session public.sessions; v_space_id uuid;
BEGIN
  SELECT * INTO v_session FROM public.authorize_session_room_capability(p_session_id, p_user_id);
  v_space_id := v_session.space_id;
  IF v_space_id IS NULL THEN
    INSERT INTO public.spaces(kind, voyage_id, ai_present, created_by)
    VALUES ('room', v_session.voyage_id, p_present, p_user_id)
    RETURNING spaces.id INTO v_space_id;
    INSERT INTO public.space_members(space_id, user_id, state)
    VALUES (v_space_id, p_user_id, 'active');
    UPDATE public.sessions SET space_id = v_space_id WHERE id = p_session_id;
  ELSE
    UPDATE public.spaces SET ai_present = p_present WHERE id = v_space_id
      AND voyage_id IS NOT DISTINCT FROM v_session.voyage_id;
  END IF;
  RETURN FOUND;
END $$;
CREATE FUNCTION public.remove_session_room_member(p_session_id uuid, p_user_id uuid,
  p_member_user_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_session public.sessions;
BEGIN
  SELECT * INTO v_session FROM public.authorize_session_room_capability(
    p_session_id, p_user_id);
  IF v_session.space_id IS NULL OR p_member_user_id = p_user_id THEN RETURN false; END IF;
  UPDATE public.space_members SET state = 'left'
  WHERE space_id = v_session.space_id AND user_id = p_member_user_id
    AND state = 'active';
  RETURN FOUND;
END $$;
REVOKE ALL ON TABLE public.sessions FROM service_role;
REVOKE ALL PRIVILEGES (id, user_id, title, status, last_message_at, message_count,
  title_generated_at, extracted_at, voyage_id, space_id, created_at, updated_at)
  ON TABLE public.sessions FROM service_role;
REVOKE ALL ON FUNCTION public.authorize_session_scope(uuid, uuid, boolean),
  public.authorize_session_room_capability(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_session_scope(uuid, uuid),
  public.get_or_create_active_session(uuid, text),
  public.get_resumable_sessions(uuid, text, integer),
  public.resume_session(uuid, uuid), public.archive_session(uuid, uuid),
  public.touch_session_activity(uuid, uuid), public.get_last_active_voyage_slug(uuid),
  public.set_session_ai_presence(uuid, uuid, boolean),
  public.remove_session_room_member(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_scope(uuid, uuid),
  public.get_or_create_active_session(uuid, text),
  public.get_resumable_sessions(uuid, text, integer),
  public.resume_session(uuid, uuid), public.archive_session(uuid, uuid),
  public.touch_session_activity(uuid, uuid), public.get_last_active_voyage_slug(uuid),
  public.set_session_ai_presence(uuid, uuid, boolean),
  public.remove_session_room_member(uuid, uuid, uuid) TO service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_voyage_with_captain(text, text, text, uuid) FROM authenticated; GRANT EXECUTE ON FUNCTION public.create_voyage_with_captain(text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_promotion_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.canonical_space_member_id(uuid, uuid) TO service_role;
