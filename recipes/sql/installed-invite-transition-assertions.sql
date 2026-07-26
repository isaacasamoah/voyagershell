DO $installed_invite_transition$
DECLARE
  legacy_result record;
  fresh_invite record;
  fresh_result record;
  fresh_event_space uuid;
BEGIN
  IF (SELECT state FROM public.space_members
      WHERE space_id = '44000000-0000-4000-8000-000000000001'
        AND user_id = '14000000-0000-4000-8000-000000000002')
      IS DISTINCT FROM 'left' THEN
    RAISE EXCEPTION 'installed_legacy_pending_invite_not_retired';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.knowledge_events
    WHERE id = '64000000-0000-4000-8000-000000000001'
      AND event_type = 'message'
      AND user_id = '14000000-0000-4000-8000-000000000001'
      AND voyage_slug = 'installed-invite'
      AND participants = ARRAY[
        '14000000-0000-4000-8000-000000000002']::uuid[]
      AND content = 'Legacy Inviter invited you to a room — reply to join.'
      AND metadata = '{"classifications":[],"entities":[],"topics":[],
        "session_id":"54000000-0000-4000-8000-000000000001",
        "source":"invite",
        "sender_display_name":"Legacy Inviter",
        "sender_user_id":"14000000-0000-4000-8000-000000000001"}'::jsonb
      AND source_type = 'conversation'
      AND source_ref = '{
        "conversation_id":"54000000-0000-4000-8000-000000000001",
        "role":"user"}'::jsonb
      AND actor_id = '14000000-0000-4000-8000-000000000001'
      AND actor_type = 'user'
  ) THEN
    RAISE EXCEPTION 'installed_legacy_invite_ledger_changed';
  END IF;
  IF (SELECT metadata ? 'space_id' FROM public.knowledge_events
      WHERE id = '64000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'installed_legacy_invite_space_was_synthesized';
  END IF;

  SELECT * INTO legacy_result FROM public.transition_room_invite(
    '54000000-0000-4000-8000-000000000002',
    '14000000-0000-4000-8000-000000000002',
    '44000000-0000-4000-8000-000000000001',
    'accept'
  );
  IF legacy_result.transition_status <> 'no_pending_invite'
      OR legacy_result.transition_space_id IS NOT NULL
      OR (SELECT space_id FROM public.sessions
        WHERE id = '54000000-0000-4000-8000-000000000002') IS NOT NULL THEN
    RAISE EXCEPTION 'installed_legacy_invite_remained_actionable';
  END IF;

  SELECT * INTO fresh_invite FROM public.create_room_invite(
    '54000000-0000-4000-8000-000000000001',
    '14000000-0000-4000-8000-000000000001',
    '14000000-0000-4000-8000-000000000002'
  );
  IF fresh_invite.invite_status <> 'invited'
      OR fresh_invite.invite_space_id IS NULL THEN
    RAISE EXCEPTION 'installed_fresh_exact_invite_not_created';
  END IF;

  INSERT INTO public.knowledge_events(
    id, event_type, user_id, voyage_slug, participants, content, metadata,
    source_type, source_ref, actor_id, actor_type
  ) VALUES (
    '64000000-0000-4000-8000-000000000002',
    'message',
    '14000000-0000-4000-8000-000000000001',
    'installed-invite',
    ARRAY['14000000-0000-4000-8000-000000000002']::uuid[],
    'Legacy Inviter invited you to a room — reply to join.',
    jsonb_build_object(
      'classifications', '[]'::jsonb,
      'entities', '[]'::jsonb,
      'topics', '[]'::jsonb,
      'session_id', '54000000-0000-4000-8000-000000000001',
      'source', 'invite',
      'sender_display_name', 'Legacy Inviter',
      'sender_user_id', '14000000-0000-4000-8000-000000000001',
      'space_id', fresh_invite.invite_space_id
    ),
    'conversation',
    '{"conversation_id":"54000000-0000-4000-8000-000000000001",
      "role":"user"}',
    '14000000-0000-4000-8000-000000000001',
    'user'
  );
  SELECT (metadata->>'space_id')::uuid
  INTO fresh_event_space
  FROM public.knowledge_events
  WHERE id = '64000000-0000-4000-8000-000000000002';

  SELECT * INTO fresh_result FROM public.transition_room_invite(
    '54000000-0000-4000-8000-000000000002',
    '14000000-0000-4000-8000-000000000002',
    fresh_event_space,
    'accept'
  );
  IF fresh_event_space IS DISTINCT FROM fresh_invite.invite_space_id
      OR fresh_result.transition_status <> 'accepted'
      OR fresh_result.transition_space_id IS DISTINCT FROM fresh_event_space
      OR (SELECT state FROM public.space_members
        WHERE space_id = fresh_event_space
          AND user_id = '14000000-0000-4000-8000-000000000002') <> 'active'
      OR (SELECT space_id FROM public.sessions
        WHERE id = '54000000-0000-4000-8000-000000000002')
        IS DISTINCT FROM fresh_event_space THEN
    RAISE EXCEPTION 'installed_fresh_exact_invite_not_actionable';
  END IF;
END
$installed_invite_transition$;

SELECT 'INSTALLED_INVITE_TRANSITION_GREEN';
