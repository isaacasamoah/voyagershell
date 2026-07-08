-- =============================================================================
-- Migration 037: Messaging v2 — drop the pre-ledger weave delivery columns
-- =============================================================================
-- The wire (message_deliveries) is the sole delivery lane. The awareness weave
-- (Sentinel + loadAwareness) and its columns are removed. Order matters:
--   1. Recreate apply_knowledge_event WITHOUT delivery_status (it INSERTed it)
--   2. Drop the delivery index
--   3. Drop the dead columns
-- Run AFTER the code that reads these columns is gone (same PR).
-- =============================================================================

-- 1. Trigger no longer writes delivery_status
CREATE OR REPLACE FUNCTION public.apply_knowledge_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      source_created_at, updated_at
    ) VALUES (
      NEW.id, NEW.user_id, NEW.voyage_slug, NEW.content,
      v_classifications, v_entities, v_topics,
      NEW.participants, v_session_id,
      NEW.event_type, v_sender_display_name, v_sender_user_id, v_addressed_to,
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
$function$

-- 2. Drop the delivery index (depended on delivery_status)
DROP INDEX IF EXISTS idx_knowledge_delivery;

-- 3. Drop the pre-ledger delivery-lifecycle columns
ALTER TABLE public.knowledge_current
  DROP COLUMN IF EXISTS delivery_status,
  DROP COLUMN IF EXISTS surfacing_tier,
  DROP COLUMN IF EXISTS deliver_after;

-- 4. Drop the pull-era seen tracking (superseded by message_deliveries.seen_at)
ALTER TABLE public.voyage_members
  DROP COLUMN IF EXISTS last_seen_at;
