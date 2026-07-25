CREATE OR REPLACE FUNCTION public.promote_private_voyager_reply(
  p_source_event_id uuid,
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS TABLE(shared_event_id uuid, status text, shared_content text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_space_id uuid;
  v_voyage_id uuid;
  v_voyage_slug text;
  v_source_content text;
  v_existing uuid;
  v_new uuid := gen_random_uuid();
  v_claimed uuid;
  v_participants uuid[];
  v_recipients uuid[];
  v_sender_name text;
BEGIN
  SELECT session.space_id, session.voyage_id, voyage.slug
  INTO v_space_id, v_voyage_id, v_voyage_slug
  FROM public.sessions session
  JOIN public.spaces space ON space.id = session.space_id
  LEFT JOIN public.voyages voyage ON voyage.id = session.voyage_id
  WHERE session.id = p_conversation_id
    AND session.user_id = p_user_id
    AND space.voyage_id IS NOT DISTINCT FROM session.voyage_id
  FOR SHARE OF session, space;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'share_session_access_denied' USING ERRCODE = '42501';
  END IF;

  IF v_voyage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.voyage_members parent
    WHERE parent.voyage_id = v_voyage_id
      AND parent.user_id = p_user_id
      AND parent.state = 'active'
  ) THEN
    RAISE EXCEPTION 'share_session_access_denied' USING ERRCODE = '42501';
  END IF;

  SELECT event.content
  INTO v_source_content
  FROM public.knowledge_events event
  WHERE event.id = p_source_event_id
    AND event.event_type = 'conversation'
    AND event.actor_type = 'voyager'
    AND event.user_id = p_user_id
    AND event.participants = ARRAY[p_user_id]::uuid[]
    AND event.metadata->>'session_id' = p_conversation_id::text
    AND event.source_ref->>'conversation_id' = p_conversation_id::text
    AND event.source_ref->>'role' = 'assistant'
    AND event.voyage_slug IS NOT DISTINCT FROM v_voyage_slug
    AND nullif(btrim(event.content), '') IS NOT NULL
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'share_source_not_shareable' USING ERRCODE = '42501';
  END IF;

  IF v_voyage_id IS NULL THEN
    SELECT array_agg(effective_member.user_id ORDER BY effective_member.user_id)
    INTO v_participants
    FROM (
      SELECT member.user_id
      FROM public.space_members member
      WHERE member.space_id = v_space_id
        AND member.state = 'active'
      ORDER BY member.user_id
      FOR UPDATE OF member
    ) effective_member;
  ELSE
    SELECT array_agg(effective_member.user_id ORDER BY effective_member.user_id)
    INTO v_participants
    FROM (
      SELECT child.user_id
      FROM public.voyage_members parent
      JOIN public.space_members child ON child.user_id = parent.user_id
      WHERE parent.voyage_id = v_voyage_id
        AND parent.state = 'active'
        AND child.space_id = v_space_id
        AND child.state = 'active'
      ORDER BY child.user_id
      FOR UPDATE OF parent, child
    ) effective_member;
  END IF;

  IF NOT p_user_id = ANY(coalesce(v_participants, ARRAY[]::uuid[])) THEN
    RAISE EXCEPTION 'share_not_active_in_room' USING ERRCODE = '42501';
  END IF;

  SELECT promotion.shared_event_id
  INTO v_existing
  FROM public.private_reply_promotions promotion
  WHERE promotion.source_event_id = p_source_event_id
    AND promotion.sharer_user_id = p_user_id
    AND promotion.destination_space_id = v_space_id;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, 'replayed'::text, v_source_content;
    RETURN;
  END IF;

  v_recipients := array_remove(v_participants, p_user_id);
  IF coalesce(cardinality(v_recipients), 0) = 0 THEN
    RAISE EXCEPTION 'share_room_has_no_audience' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(profile.display_name, profile.username, 'Someone')
  INTO v_sender_name
  FROM public.profiles profile
  WHERE profile.id = p_user_id;

  INSERT INTO public.private_reply_promotions(
    source_event_id,
    sharer_user_id,
    destination_space_id,
    shared_event_id
  )
  VALUES (p_source_event_id, p_user_id, v_space_id, v_new)
  ON CONFLICT (source_event_id, sharer_user_id, destination_space_id) DO NOTHING
  RETURNING private_reply_promotions.shared_event_id
  INTO v_claimed;

  IF v_claimed IS NULL THEN
    SELECT promotion.shared_event_id
    INTO v_existing
    FROM public.private_reply_promotions promotion
    WHERE promotion.source_event_id = p_source_event_id
      AND promotion.sharer_user_id = p_user_id
      AND promotion.destination_space_id = v_space_id;

    RETURN QUERY SELECT v_existing, 'replayed'::text, v_source_content;
    RETURN;
  END IF;

  INSERT INTO public.knowledge_events(
    id,
    event_type,
    user_id,
    voyage_slug,
    participants,
    content,
    metadata,
    source_type,
    source_ref,
    actor_id,
    actor_type
  )
  VALUES (
    v_new,
    'message',
    p_user_id,
    v_voyage_slug,
    v_participants,
    v_source_content,
    jsonb_build_object(
      'classifications', '[]'::jsonb,
      'entities', '[]'::jsonb,
      'topics', '[]'::jsonb,
      'addressed_to', to_jsonb(v_recipients),
      'source', 'shared-voyager',
      'sender_display_name', v_sender_name,
      'sender_user_id', p_user_id
    ),
    'conversation',
    NULL,
    p_user_id,
    'user'
  );

  UPDATE public.knowledge_current
  SET
    attention_score = 0.85,
    context_snippet = v_sender_name || ' shared to room: ' || left(v_source_content, 60),
    updated_at = now()
  WHERE event_id = v_new;

  INSERT INTO public.message_deliveries(event_id, recipient_user_id)
  SELECT v_new, recipient
  FROM unnest(v_recipients) recipient
  ON CONFLICT (event_id, recipient_user_id) DO NOTHING;

  UPDATE public.sessions
  SET
    last_message_at = now(),
    updated_at = now()
  WHERE id = p_conversation_id;

  RETURN QUERY SELECT v_new, 'created'::text, v_source_content;
END
$$;

REVOKE EXECUTE ON FUNCTION public.promote_private_voyager_reply(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_private_voyager_reply(uuid, uuid, uuid)
  TO service_role;
