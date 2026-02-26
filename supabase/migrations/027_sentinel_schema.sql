-- =============================================================================
-- Migration 027: Sentinel Schema (Foundation MVP)
-- =============================================================================
--
-- Adds delivery lifecycle columns to knowledge_current for Sentinel:
--   1. surfacing_tier — Sentinel classification (interrupt/weave/suppress)
--   2. deliver_after — Temporal gating (D26)
--   3. delivery_status — Per-message lifecycle (D30, replaces last_seen_at)
--   4. Index for sweep queries
--   5. Update trigger to propagate delivery_status for message-type events
--
-- Design decisions: D24-D40 in sentinel spec
-- Key: delivery_status replaces last_seen_at as primary delivery mechanism (D30)
--
-- =============================================================================

-- =============================================================================
-- STEP 1: Add Sentinel columns to knowledge_current
-- =============================================================================

ALTER TABLE public.knowledge_current
  ADD COLUMN IF NOT EXISTS surfacing_tier TEXT DEFAULT NULL;

ALTER TABLE public.knowledge_current
  ADD COLUMN IF NOT EXISTS deliver_after TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.knowledge_current
  ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'pending';

COMMENT ON COLUMN public.knowledge_current.surfacing_tier IS 'Sentinel classification: interrupt (urgent), weave (contextual), suppress (hide). NULL = unevaluated, treated as weave by loadAwareness.';
COMMENT ON COLUMN public.knowledge_current.deliver_after IS 'Temporal gate (D26). Message held until this time. NULL = deliver immediately.';
COMMENT ON COLUMN public.knowledge_current.delivery_status IS 'Per-message lifecycle (D30): pending → delivered | held | expired. Replaces last_seen_at.';

-- =============================================================================
-- STEP 2: Index for sweep queries
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_knowledge_delivery
  ON public.knowledge_current (delivery_status, deliver_after);

-- =============================================================================
-- STEP 3: Rewrite apply_knowledge_event trigger
-- =============================================================================
-- Changes from migration 026 version:
--   + Sets delivery_status = 'pending' for message-type source events
--   (All other source events get default 'pending' from column default,
--    but messages are explicitly set for clarity and future filtering)

CREATE OR REPLACE FUNCTION public.apply_knowledge_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  IF NEW.event_type IN ('message', 'document', 'slack_message', 'jira_update', 'explicit') THEN
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

    -- sender_user_id: text → UUID (NULL-safe)
    IF NEW.metadata->>'sender_user_id' IS NOT NULL THEN
      v_sender_user_id := (NEW.metadata->>'sender_user_id')::UUID;
    ELSE
      v_sender_user_id := NULL;
    END IF;

    -- addressed_to: JSONB array → UUID[] (must unpack elements as text first)
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

COMMENT ON FUNCTION public.apply_knowledge_event IS 'Computes knowledge_current state from event stream. Propagates participants, event_type, sender attribution, addressed_to (V6), and delivery_status (Sentinel).';
