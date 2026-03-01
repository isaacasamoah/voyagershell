-- Add 'conversation' to valid_event_type CHECK constraint AND trigger function.
-- Commit 8693090 changed chat turns from eventType 'message' to 'conversation'
-- to distinguish conversation turns (Cartographer enriches) from inter-user messages
-- (resolve_mention, skip Cartographer). Neither the CHECK constraint nor the
-- apply_knowledge_event() trigger were updated, so conversation events were either
-- rejected (CHECK) or silently skipped (trigger → no knowledge_current row).

-- 1. Fix CHECK constraint
ALTER TABLE knowledge_events DROP CONSTRAINT valid_event_type;

ALTER TABLE knowledge_events ADD CONSTRAINT valid_event_type CHECK (
  event_type = ANY (ARRAY[
    'conversation',
    'message',
    'document',
    'slack_message',
    'jira_update',
    'explicit',
    'quieted',
    'activated',
    'pinned',
    'unpinned',
    'importance_changed',
    'summary',
    'connection',
    'superseded'
  ])
);

-- 2. Fix trigger function to handle 'conversation' event type
CREATE OR REPLACE FUNCTION public.apply_knowledge_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_target_id UUID;
  v_classifications TEXT[];
  v_entities TEXT[];
  v_topics TEXT[];
  v_session_id TEXT;
  v_sender_display_name TEXT;
  v_sender_user_id UUID;
  v_addressed_to UUID[];
BEGIN
  -- ==========================================================================
  -- SOURCE EVENTS: Create knowledge_current row (the content IS the knowledge)
  -- ==========================================================================
  IF NEW.event_type IN ('conversation', 'message', 'document', 'slack_message', 'jira_update', 'explicit') THEN
    -- Parse classifications from metadata
    SELECT COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(NEW.metadata->'classifications')),
      '{}'::TEXT[]
    ) INTO v_classifications;

    SELECT COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(NEW.metadata->'entities')),
      '{}'::TEXT[]
    ) INTO v_entities;

    SELECT COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(NEW.metadata->'topics')),
      '{}'::TEXT[]
    ) INTO v_topics;

    -- Extract session_id from metadata (nullable)
    v_session_id := NEW.metadata->>'session_id';

    -- V6: Extract sender attribution from metadata
    v_sender_display_name := NEW.metadata->>'sender_display_name';

    -- sender_user_id: text -> UUID (NULL-safe)
    IF NEW.metadata->>'sender_user_id' IS NOT NULL THEN
      v_sender_user_id := (NEW.metadata->>'sender_user_id')::UUID;
    ELSE
      v_sender_user_id := NULL;
    END IF;

    -- addressed_to: JSONB array -> UUID[] (must unpack elements as text first)
    IF NEW.metadata ? 'addressed_to' THEN
      SELECT ARRAY(
        SELECT jsonb_array_elements_text(NEW.metadata->'addressed_to')
      )::UUID[] INTO v_addressed_to;
    ELSE
      v_addressed_to := NULL;
    END IF;

    INSERT INTO public.knowledge_current (
      event_id, user_id, voyage_slug, content,
      classifications, entities, topics,
      participants, session_id,
      event_type, sender_display_name, sender_user_id, addressed_to,
      delivery_status,
      source_created_at, updated_at
    ) VALUES (
      NEW.id, NEW.user_id, NEW.voyage_slug, NEW.content,
      v_classifications, v_entities, v_topics,
      NEW.participants, v_session_id,
      NEW.event_type, v_sender_display_name, v_sender_user_id, v_addressed_to,
      'pending',  -- All source events start as pending (D30)
      NEW.created_at, NOW()
    );

  -- ==========================================================================
  -- UNDERSTANDING EVENTS: Update graph connections
  -- ==========================================================================
  ELSIF NEW.event_type = 'connection' THEN
    -- Add bidirectional connection
    UPDATE public.knowledge_current
    SET connected_to = array_append(
          array_remove(connected_to, (NEW.metadata->>'to_id')::UUID),
          (NEW.metadata->>'to_id')::UUID
        ),
        updated_at = NOW()
    WHERE event_id = (NEW.metadata->>'from_id')::UUID;

    -- Also add reverse connection
    UPDATE public.knowledge_current
    SET connected_to = array_append(
          array_remove(connected_to, (NEW.metadata->>'from_id')::UUID),
          (NEW.metadata->>'from_id')::UUID
        ),
        updated_at = NOW()
    WHERE event_id = (NEW.metadata->>'to_id')::UUID;

  END IF;

  RETURN NEW;
END;
$$;

-- 3. Backfill: create knowledge_current rows for any conversation events that
--    were inserted after the CHECK fix but before the trigger fix.
INSERT INTO knowledge_current (
  event_id, user_id, voyage_slug, content,
  classifications, entities, topics,
  participants, session_id,
  event_type, delivery_status,
  source_created_at, updated_at
)
SELECT
  ke.id, ke.user_id, ke.voyage_slug, ke.content,
  COALESCE(ARRAY(SELECT jsonb_array_elements_text(ke.metadata->'classifications')), '{}'::TEXT[]),
  COALESCE(ARRAY(SELECT jsonb_array_elements_text(ke.metadata->'entities')), '{}'::TEXT[]),
  COALESCE(ARRAY(SELECT jsonb_array_elements_text(ke.metadata->'topics')), '{}'::TEXT[]),
  ke.participants,
  ke.metadata->>'session_id',
  ke.event_type,
  'pending',
  ke.created_at, NOW()
FROM knowledge_events ke
LEFT JOIN knowledge_current kc ON ke.id = kc.event_id
WHERE ke.event_type = 'conversation'
  AND kc.event_id IS NULL;
