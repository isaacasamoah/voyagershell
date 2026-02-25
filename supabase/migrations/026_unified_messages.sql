-- =============================================================================
-- Migration 026: Unified Message Model (Voyage 6)
-- =============================================================================
--
-- Makes messaging actually work on the read path:
--   1. Denormalize event_type onto knowledge_current (filter messages structurally)
--   2. Add sender_display_name + sender_user_id (attribution without lookup)
--   3. Add addressed_to UUID[] (attention gate: "who was this message FOR?")
--   4. Update trigger to propagate all four fields from knowledge_events
--   5. Backfill event_type for existing rows
--   6. Add last_seen_at to voyage_members (for F1: pre-turn surfacing)
--
-- Design decisions: D14-D23 in voyage-decisions.md
-- Key: event_type (container) != knowledge_type (content nature) — orthogonal axes
--
-- =============================================================================

-- =============================================================================
-- STEP 1: Add denormalized columns to knowledge_current
-- =============================================================================

ALTER TABLE public.knowledge_current
  ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT NULL;

ALTER TABLE public.knowledge_current
  ADD COLUMN IF NOT EXISTS sender_display_name TEXT DEFAULT NULL;

ALTER TABLE public.knowledge_current
  ADD COLUMN IF NOT EXISTS sender_user_id UUID DEFAULT NULL;

ALTER TABLE public.knowledge_current
  ADD COLUMN IF NOT EXISTS addressed_to UUID[] DEFAULT NULL;

COMMENT ON COLUMN public.knowledge_current.event_type IS 'Denormalized from knowledge_events. Container type: message/document/slack/etc. Orthogonal to knowledge_type (D18).';
COMMENT ON COLUMN public.knowledge_current.sender_display_name IS 'Human-readable sender name for message attribution (D16).';
COMMENT ON COLUMN public.knowledge_current.sender_user_id IS 'Sender UUID for message attribution and self-exclusion (D16).';
COMMENT ON COLUMN public.knowledge_current.addressed_to IS 'Attention gate: who was this message specifically FOR? (D20). Distinct from participants (visibility gate).';

-- =============================================================================
-- STEP 2: Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_kc_event_type ON public.knowledge_current (event_type);
CREATE INDEX IF NOT EXISTS idx_kc_addressed_to ON public.knowledge_current USING GIN (addressed_to);

-- =============================================================================
-- STEP 3: voyage_members.last_seen_at (F1: pre-turn surfacing)
-- =============================================================================

ALTER TABLE public.voyage_members
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.voyage_members.last_seen_at IS 'Updated on each chat request. Used by loadPendingMessages() to surface only new messages.';

-- =============================================================================
-- STEP 4: Rewrite apply_knowledge_event trigger
-- =============================================================================
-- Changes from migration 024 version:
--   + Propagates NEW.event_type into knowledge_current.event_type
--   + Extracts sender_display_name from metadata
--   + Extracts sender_user_id from metadata
--   + Extracts addressed_to UUID[] from metadata JSONB array
--     (JSONB→UUID[] requires unpacking: ARRAY(SELECT jsonb_array_elements_text(...))::UUID[])

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
$$;

COMMENT ON FUNCTION public.apply_knowledge_event IS 'Computes knowledge_current state from event stream. Propagates participants, event_type, sender attribution, and addressed_to (V6).';

-- =============================================================================
-- STEP 5: Backfill event_type from knowledge_events
-- =============================================================================

UPDATE public.knowledge_current kc
SET event_type = ke.event_type
FROM public.knowledge_events ke
WHERE kc.event_id = ke.id
  AND kc.event_type IS NULL;
