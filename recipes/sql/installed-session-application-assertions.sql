SET statement_timeout = '30s';
SET ROLE service_role;
DO $application_calls$
DECLARE
  v_personal uuid;
  v_space uuid;
BEGIN
  BEGIN
    PERFORM 1 FROM public.sessions;
    RAISE EXCEPTION 'installed_application_direct_session_read_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT active.id INTO STRICT v_personal
  FROM public.get_or_create_active_session(
    '10000000-0000-4000-8000-000000000001', NULL) active;
  IF (SELECT count(*) FROM public.get_or_create_active_session(
      '10000000-0000-4000-8000-000000000001', NULL)
      WHERE id = v_personal AND voyage_slug IS NULL) <> 1 THEN
    RAISE EXCEPTION 'installed_application_personal_session_not_stable';
  END IF;
  IF NOT public.touch_session_activity(
      v_personal, '10000000-0000-4000-8000-000000000001')
    OR NOT public.archive_session(
      v_personal, '10000000-0000-4000-8000-000000000001')
    OR (SELECT count(*) FROM public.resume_session(
      v_personal, '10000000-0000-4000-8000-000000000001')
      WHERE status = 'active' AND voyage_slug IS NULL) <> 1
  THEN
    RAISE EXCEPTION 'installed_application_personal_lifecycle_failed';
  END IF;

  IF NOT public.set_session_ai_presence(
      v_personal, '10000000-0000-4000-8000-000000000001', false) THEN
    RAISE EXCEPTION 'installed_application_room_creation_failed';
  END IF;
  SELECT scope.space_id INTO STRICT v_space FROM public.get_session_scope(
    v_personal, '10000000-0000-4000-8000-000000000001') scope;
  INSERT INTO public.space_members(space_id, user_id, state) VALUES
    (v_space, '10000000-0000-4000-8000-000000000002', 'active');
  IF NOT public.remove_session_room_member(
      v_personal, '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'installed_application_room_removal_failed';
  END IF;

  UPDATE public.space_members SET state = 'left'
  WHERE space_id = v_space
    AND user_id = '10000000-0000-4000-8000-000000000001';
  IF (SELECT count(*) FROM public.get_session_scope(
        v_personal, '10000000-0000-4000-8000-000000000001')
      WHERE space_id = v_space) <> 1
    OR (SELECT count(*) FROM public.get_or_create_active_session(
        '10000000-0000-4000-8000-000000000001', NULL)
      WHERE id = v_personal AND space_id = v_space) <> 1
    OR (SELECT count(*) FROM public.get_resumable_sessions(
        '10000000-0000-4000-8000-000000000001', NULL, 10)
      WHERE id = v_personal) <> 1
    OR NOT public.touch_session_activity(
      v_personal, '10000000-0000-4000-8000-000000000001')
    OR NOT public.archive_session(
      v_personal, '10000000-0000-4000-8000-000000000001')
    OR (SELECT count(*) FROM public.resume_session(
        v_personal, '10000000-0000-4000-8000-000000000001')
      WHERE status = 'active' AND space_id = v_space) <> 1
  THEN
    RAISE EXCEPTION 'installed_application_left_space_scope_denied';
  END IF;
  BEGIN
    PERFORM public.set_session_ai_presence(
      v_personal, '10000000-0000-4000-8000-000000000001', true);
    RAISE EXCEPTION 'installed_application_left_space_room_mutation_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.remove_session_room_member(
      v_personal, '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'installed_application_left_space_room_mutation_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT ai_present FROM public.spaces WHERE id = v_space) IS DISTINCT FROM false
    OR EXISTS (SELECT 1 FROM public.space_members
      WHERE space_id = v_space AND state = 'active') THEN
    RAISE EXCEPTION 'installed_application_left_space_remained_shared';
  END IF;

  BEGIN
    PERFORM public.get_session_scope(
      v_personal, '10000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'installed_application_cross_owner_scope_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.get_or_create_active_session(
      '10000000-0000-4000-8000-000000000003', 'installed-authority');
    RAISE EXCEPTION 'installed_application_nonmember_slug_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.voyage_members SET state = 'left'
  WHERE voyage_id = '20000000-0000-4000-8000-000000000001'
    AND user_id = '10000000-0000-4000-8000-000000000002';
  BEGIN
    PERFORM public.get_session_scope(
      '22000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'installed_application_left_voyage_scope_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.get_resumable_sessions(
      '10000000-0000-4000-8000-000000000002', 'installed-authority', 10);
    RAISE EXCEPTION 'installed_application_left_voyage_list_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.voyage_members SET state = 'active'
  WHERE voyage_id = '20000000-0000-4000-8000-000000000001'
    AND user_id = '10000000-0000-4000-8000-000000000002';
  IF public.get_last_active_voyage_slug(
      '10000000-0000-4000-8000-000000000002')
      IS DISTINCT FROM 'installed-authority' THEN
    RAISE EXCEPTION 'installed_application_last_voyage_not_authorized';
  END IF;
END
$application_calls$;
RESET ROLE;
SELECT 'INSTALLED_SESSION_APPLICATION_CALL_GREEN';
