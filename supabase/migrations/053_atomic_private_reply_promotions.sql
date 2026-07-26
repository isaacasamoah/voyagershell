-- Atomic, idempotent promotion of one owner-private Voyager reply into the
-- current room. The mapping is deliberately server-private: it is publication
-- state, not knowledge, and it is the durable authority behind the Share UI.

CREATE TABLE public.private_reply_promotions (
  source_event_id UUID NOT NULL REFERENCES public.knowledge_events(id) ON DELETE RESTRICT,
  sharer_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  destination_space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  shared_event_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_event_id, sharer_user_id, destination_space_id),
  CONSTRAINT private_reply_promotions_shared_event_fkey
    FOREIGN KEY (shared_event_id)
    REFERENCES public.knowledge_events(id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE public.private_reply_promotions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.private_reply_promotions FROM PUBLIC;
REVOKE ALL ON TABLE public.private_reply_promotions FROM anon;
REVOKE ALL ON TABLE public.private_reply_promotions FROM authenticated;
GRANT ALL ON TABLE public.private_reply_promotions TO service_role;

COMMENT ON TABLE public.private_reply_promotions IS
  'Server-private idempotency mapping for promoting an owner-private Voyager reply into one destination room.';

CREATE OR REPLACE FUNCTION public.promote_private_voyager_reply(
  p_source_event_id UUID,
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  shared_event_id UUID,
  status TEXT,
  shared_content TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_space_id UUID;
  v_voyage_id UUID;
  v_voyage_slug TEXT;
  v_source_content TEXT;
  v_existing_event_id UUID;
  v_new_event_id UUID := gen_random_uuid();
  v_claimed_event_id UUID;
  v_participants UUID[];
  v_recipients UUID[];
  v_sender_name TEXT;
BEGIN
  -- Session ownership is always revalidated, including on replay.
  SELECT s.space_id, s.voyage_id, v.slug
  INTO v_space_id, v_voyage_id, v_voyage_slug
  FROM public.sessions s
  LEFT JOIN public.voyages v ON v.id = s.voyage_id
  WHERE s.id = p_conversation_id
    AND s.user_id = p_user_id
  FOR SHARE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'share_session_access_denied' USING ERRCODE = '42501';
  END IF;

  -- Session ownership is not enough for a voyage-scoped room. A removed
  -- voyage member may retain historical session/space pointers, but those
  -- pointers cannot preserve publication authority.
  IF v_voyage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.voyage_members voyage_member
    WHERE voyage_member.voyage_id = v_voyage_id
      AND voyage_member.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'share_session_access_denied' USING ERRCODE = '42501';
  END IF;

  -- The source is canonical owner-private conversation data from this exact
  -- session. Validate it before replay lookup so a caller cannot use the
  -- mapping as an oracle for someone else's private event.
  SELECT ke.content
  INTO v_source_content
  FROM public.knowledge_events ke
  WHERE ke.id = p_source_event_id
    AND ke.event_type = 'conversation'
    AND ke.actor_type = 'voyager'
    AND ke.user_id = p_user_id
    AND ke.participants = ARRAY[p_user_id]::UUID[]
    AND ke.metadata->>'session_id' = p_conversation_id::TEXT
    AND ke.source_ref->>'conversation_id' = p_conversation_id::TEXT
    AND ke.source_ref->>'role' = 'assistant'
    AND ke.voyage_slug IS NOT DISTINCT FROM v_voyage_slug
    AND NULLIF(BTRIM(ke.content), '') IS NOT NULL
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'share_source_not_shareable' USING ERRCODE = '42501';
  END IF;

  IF v_space_id IS NULL THEN
    RAISE EXCEPTION 'share_room_has_no_audience' USING ERRCODE = 'P0001';
  END IF;

  -- A real retry is successful even if the room roster changed after the
  -- original commit. Destination space remains part of the key, so the same
  -- private reply may still be promoted once into a different future room.
  SELECT promotion.shared_event_id
  INTO v_existing_event_id
  FROM public.private_reply_promotions promotion
  WHERE promotion.source_event_id = p_source_event_id
    AND promotion.sharer_user_id = p_user_id
    AND promotion.destination_space_id = v_space_id;

  IF v_existing_event_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_event_id, 'replayed'::TEXT, v_source_content;
    RETURN;
  END IF;

  -- Only a currently active member can create a NEW publication.
  IF NOT EXISTS (
    SELECT 1
    FROM public.space_members member
    WHERE member.space_id = v_space_id
      AND member.user_id = p_user_id
      AND member.state = 'active'
  ) THEN
    RAISE EXCEPTION 'share_not_active_in_room' USING ERRCODE = '42501';
  END IF;

  -- Lock and snapshot the current audience. Membership transitions wait until
  -- this transaction either publishes the matching event + deliveries or
  -- rolls the whole attempt back.
  SELECT ARRAY_AGG(member.user_id ORDER BY member.user_id)
  INTO v_participants
  FROM (
    SELECT active_member.user_id
    FROM public.space_members active_member
    WHERE active_member.space_id = v_space_id
      AND active_member.state = 'active'
    FOR SHARE
  ) member;

  v_recipients := ARRAY_REMOVE(v_participants, p_user_id);
  IF COALESCE(CARDINALITY(v_recipients), 0) = 0 THEN
    RAISE EXCEPTION 'share_room_has_no_audience' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(profile.display_name, profile.username, 'Someone')
  INTO v_sender_name
  FROM public.profiles profile
  WHERE profile.id = p_user_id;

  -- Claim the idempotency key before inserting the event. The shared-event FK
  -- is deferred, so the claim and event can be created in this order without
  -- ever committing an orphan. A concurrent loser waits, then returns the
  -- winner's publication instead of creating another event.
  INSERT INTO public.private_reply_promotions (
    source_event_id,
    sharer_user_id,
    destination_space_id,
    shared_event_id
  ) VALUES (
    p_source_event_id,
    p_user_id,
    v_space_id,
    v_new_event_id
  )
  ON CONFLICT (source_event_id, sharer_user_id, destination_space_id) DO NOTHING
  RETURNING private_reply_promotions.shared_event_id INTO v_claimed_event_id;

  IF v_claimed_event_id IS NULL THEN
    SELECT promotion.shared_event_id
    INTO v_existing_event_id
    FROM public.private_reply_promotions promotion
    WHERE promotion.source_event_id = p_source_event_id
      AND promotion.sharer_user_id = p_user_id
      AND promotion.destination_space_id = v_space_id;

    RETURN QUERY SELECT v_existing_event_id, 'replayed'::TEXT, v_source_content;
    RETURN;
  END IF;

  INSERT INTO public.knowledge_events (
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
  ) VALUES (
    v_new_event_id,
    'message',
    p_user_id,
    v_voyage_slug,
    v_participants,
    v_source_content,
    JSONB_BUILD_OBJECT(
      'classifications', '[]'::JSONB,
      'entities', '[]'::JSONB,
      'topics', '[]'::JSONB,
      'addressed_to', TO_JSONB(v_recipients),
      'source', 'shared-voyager',
      'sender_display_name', v_sender_name,
      'sender_user_id', p_user_id
    ),
    'conversation',
    NULL,
    p_user_id,
    'user'
  );

  -- The source-event trigger creates knowledge_current synchronously. Keep the
  -- existing share attention/context semantics in the same transaction.
  UPDATE public.knowledge_current
  SET attention_score = 0.85,
      context_snippet = v_sender_name || ' shared to room: ' || LEFT(v_source_content, 60),
      updated_at = NOW()
  WHERE event_id = v_new_event_id;

  INSERT INTO public.message_deliveries (event_id, recipient_user_id)
  SELECT v_new_event_id, recipient_id
  FROM UNNEST(v_recipients) AS recipient_id
  ON CONFLICT (event_id, recipient_user_id) DO NOTHING;

  UPDATE public.sessions
  SET last_message_at = NOW(),
      updated_at = NOW()
  WHERE id = p_conversation_id;

  RETURN QUERY SELECT v_new_event_id, 'created'::TEXT, v_source_content;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.promote_private_voyager_reply(UUID, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.promote_private_voyager_reply(UUID, UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.promote_private_voyager_reply(UUID, UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.promote_private_voyager_reply(UUID, UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.promote_private_voyager_reply(UUID, UUID, UUID) IS
  'Service-role-only atomic promotion of one canonical private Voyager reply into the caller current room.';
