-- Transactional database proof for migration 053. Run only after that
-- migration is present in the target database. It borrows one canonical
-- private assistant reply and two existing profiles, creates a temporary room,
-- proves create + replay + ledger counts/provenance, then rolls everything back.
BEGIN;

DO $proof$
DECLARE
  v_source RECORD;
  v_recipient_id UUID;
  v_space_id UUID;
  v_solo_space_id UUID;
  v_other_conversation_id UUID;
  v_created RECORD;
  v_replayed RECORD;
  v_count BIGINT;
BEGIN
  SELECT
    event.id AS source_event_id,
    event.content AS source_content,
    session.id AS conversation_id,
    session.user_id AS sharer_user_id,
    session.voyage_id
  INTO v_source
  FROM public.knowledge_events event
  JOIN public.sessions session
    ON session.id = (event.metadata->>'session_id')::UUID
   AND session.id = (event.source_ref->>'conversation_id')::UUID
   AND session.user_id = event.user_id
  LEFT JOIN public.voyages voyage ON voyage.id = session.voyage_id
  WHERE event.event_type = 'conversation'
    AND event.actor_type = 'voyager'
    AND event.source_ref->>'role' = 'assistant'
    AND event.participants = ARRAY[event.user_id]::UUID[]
    AND event.voyage_slug IS NOT DISTINCT FROM voyage.slug
    AND (
      session.voyage_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.voyage_members voyage_member
        WHERE voyage_member.voyage_id = session.voyage_id
          AND voyage_member.user_id = session.user_id
      )
    )
    AND NULLIF(BTRIM(event.content), '') IS NOT NULL
  ORDER BY event.created_at DESC
  LIMIT 1;

  IF v_source.source_event_id IS NULL THEN
    RAISE EXCEPTION 'proof fixture missing: no canonical private assistant reply';
  END IF;

  SELECT profile.id
  INTO v_recipient_id
  FROM public.profiles profile
  WHERE profile.id <> v_source.sharer_user_id
  ORDER BY profile.created_at
  LIMIT 1;

  IF v_recipient_id IS NULL THEN
    RAISE EXCEPTION 'proof fixture missing: a second profile is required';
  END IF;

  INSERT INTO public.spaces (voyage_id, ai_present, created_by)
  VALUES (v_source.voyage_id, TRUE, v_source.sharer_user_id)
  RETURNING id INTO v_space_id;

  INSERT INTO public.space_members (space_id, user_id, state)
  VALUES
    (v_space_id, v_source.sharer_user_id, 'active'),
    (v_space_id, v_recipient_id, 'active');

  UPDATE public.sessions
  SET space_id = v_space_id
  WHERE id = v_source.conversation_id;

  SELECT * INTO v_created
  FROM public.promote_private_voyager_reply(
    v_source.source_event_id,
    v_source.conversation_id,
    v_source.sharer_user_id
  );

  SELECT * INTO v_replayed
  FROM public.promote_private_voyager_reply(
    v_source.source_event_id,
    v_source.conversation_id,
    v_source.sharer_user_id
  );

  IF v_created.status <> 'created' OR v_replayed.status <> 'replayed' THEN
    RAISE EXCEPTION 'expected created then replayed, got % then %', v_created.status, v_replayed.status;
  END IF;
  IF v_created.shared_event_id IS DISTINCT FROM v_replayed.shared_event_id THEN
    RAISE EXCEPTION 'replay returned a different event id';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.private_reply_promotions promotion
  WHERE promotion.source_event_id = v_source.source_event_id
    AND promotion.sharer_user_id = v_source.sharer_user_id
    AND promotion.destination_space_id = v_space_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected one promotion mapping, found %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.knowledge_events event
  WHERE event.id = v_created.shared_event_id
    AND event.event_type = 'message'
    AND event.actor_type = 'user'
    AND event.actor_id = v_source.sharer_user_id
    AND event.user_id = v_source.sharer_user_id
    AND event.content = v_source.source_content
    AND event.metadata->>'source' = 'shared-voyager'
    AND NOT (event.metadata ? 'source_event_id')
    AND NOT (event.metadata ? 'session_id')
    AND event.source_ref IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'shared event content/attribution/provenance assertion failed';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.message_deliveries delivery
  WHERE delivery.event_id = v_created.shared_event_id
    AND delivery.recipient_user_id = v_recipient_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one recipient delivery, found %', v_count;
  END IF;

  -- A foreign caller cannot borrow someone else's owned session/source.
  BEGIN
    PERFORM *
    FROM public.promote_private_voyager_reply(
      v_source.source_event_id,
      v_source.conversation_id,
      v_recipient_id
    );
    RAISE EXCEPTION 'foreign caller was unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'share_session_access_denied' THEN
      RAISE;
    END IF;
  END;

  -- An otherwise owned session cannot promote a source from another session.
  INSERT INTO public.sessions (user_id, voyage_id, status, space_id)
  VALUES (v_source.sharer_user_id, v_source.voyage_id, 'historical', v_space_id)
  RETURNING id INTO v_other_conversation_id;

  BEGIN
    PERFORM *
    FROM public.promote_private_voyager_reply(
      v_source.source_event_id,
      v_other_conversation_id,
      v_source.sharer_user_id
    );
    RAISE EXCEPTION 'wrong-session source was unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'share_source_not_shareable' THEN
      RAISE;
    END IF;
  END;

  -- A human-authored/already-public message cannot itself become a private
  -- source, even when its content originated from a valid private reply.
  BEGIN
    PERFORM *
    FROM public.promote_private_voyager_reply(
      v_created.shared_event_id,
      v_source.conversation_id,
      v_source.sharer_user_id
    );
    RAISE EXCEPTION 'already-public source was unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'share_source_not_shareable' THEN
      RAISE;
    END IF;
  END;

  -- The same source in a different destination is a new publication and must
  -- recompute audience. A solo room therefore fails instead of replaying the
  -- publication made to the earlier two-person room.
  INSERT INTO public.spaces (voyage_id, ai_present, created_by)
  VALUES (v_source.voyage_id, TRUE, v_source.sharer_user_id)
  RETURNING id INTO v_solo_space_id;
  INSERT INTO public.space_members (space_id, user_id, state)
  VALUES (v_solo_space_id, v_source.sharer_user_id, 'active');
  UPDATE public.sessions
  SET space_id = v_solo_space_id
  WHERE id = v_source.conversation_id;

  BEGIN
    PERFORM *
    FROM public.promote_private_voyager_reply(
      v_source.source_event_id,
      v_source.conversation_id,
      v_source.sharer_user_id
    );
    RAISE EXCEPTION 'solo destination was unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'share_room_has_no_audience' THEN
      RAISE;
    END IF;
  END;

  SELECT COUNT(*) INTO v_count
  FROM public.private_reply_promotions promotion
  WHERE promotion.source_event_id = v_source.source_event_id
    AND promotion.sharer_user_id = v_source.sharer_user_id
    AND promotion.destination_space_id = v_solo_space_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'failed solo attempt left a promotion mapping';
  END IF;
END;
$proof$;

ROLLBACK;
