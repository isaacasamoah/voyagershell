-- =============================================================================
-- Migration 021: Denormalize session_id onto knowledge_current
-- =============================================================================
--
-- The Cartographer queries "count unenriched events per session" on every
-- message. Currently this requires a JSONB join through knowledge_events.
-- Denormalizing session_id onto knowledge_current makes it a trivial indexed
-- query.
--
-- Also updates the apply_knowledge_event trigger to extract session_id from
-- metadata on source event insertion.
--
-- =============================================================================

-- =============================================================================
-- STEP 1: Add session_id column to knowledge_current
-- =============================================================================

ALTER TABLE public.knowledge_current
  ADD COLUMN session_id TEXT;

COMMENT ON COLUMN public.knowledge_current.session_id IS 'Denormalized from metadata->>session_id. Nullable — not all events have sessions.';

-- =============================================================================
-- STEP 2: Backfill existing rows from knowledge_events metadata
-- =============================================================================

UPDATE public.knowledge_current kc
SET session_id = (
  SELECT ke.metadata->>'session_id'
  FROM public.knowledge_events ke
  WHERE ke.id = kc.event_id
);

-- =============================================================================
-- STEP 3: Index for enrichment count query
-- (session_id, knowledge_type) covers: WHERE session_id = $1 AND knowledge_type IS NULL
-- =============================================================================

CREATE INDEX idx_current_session_enrichment
  ON public.knowledge_current (session_id, knowledge_type);

-- =============================================================================
-- STEP 4: Update apply_knowledge_event trigger to extract session_id
-- =============================================================================

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

    INSERT INTO public.knowledge_current (
      event_id, user_id, voyage_slug, content,
      classifications, entities, topics,
      is_active, is_pinned, importance,
      session_id,
      source_created_at, updated_at
    ) VALUES (
      NEW.id, NEW.user_id, NEW.voyage_slug, NEW.content,
      v_classifications, v_entities, v_topics,
      TRUE, FALSE, 0.5,  -- Default attention state
      v_session_id,
      NEW.created_at, NOW()
    );

  -- ==========================================================================
  -- ATTENTION EVENTS: Update knowledge_current state
  -- ==========================================================================
  ELSIF NEW.event_type = 'quieted' THEN
    v_target_id := (NEW.metadata->>'target_id')::UUID;
    UPDATE public.knowledge_current
    SET is_active = FALSE, updated_at = NOW()
    WHERE event_id = v_target_id;

  ELSIF NEW.event_type = 'activated' THEN
    v_target_id := (NEW.metadata->>'target_id')::UUID;
    UPDATE public.knowledge_current
    SET is_active = TRUE, updated_at = NOW()
    WHERE event_id = v_target_id;

  ELSIF NEW.event_type = 'pinned' THEN
    v_target_id := (NEW.metadata->>'target_id')::UUID;
    UPDATE public.knowledge_current
    SET is_pinned = TRUE, is_active = TRUE, updated_at = NOW()
    WHERE event_id = v_target_id;

  ELSIF NEW.event_type = 'unpinned' THEN
    v_target_id := (NEW.metadata->>'target_id')::UUID;
    UPDATE public.knowledge_current
    SET is_pinned = FALSE, updated_at = NOW()
    WHERE event_id = v_target_id;

  ELSIF NEW.event_type = 'importance_changed' THEN
    v_target_id := (NEW.metadata->>'target_id')::UUID;
    UPDATE public.knowledge_current
    SET importance = COALESCE((NEW.metadata->>'new_importance')::FLOAT, importance),
        updated_at = NOW()
    WHERE event_id = v_target_id;

  -- ==========================================================================
  -- UNDERSTANDING EVENTS: Update graph connections
  -- ==========================================================================
  ELSIF NEW.event_type = 'connection' THEN
    -- Add bidirectional connection
    UPDATE public.knowledge_current
    SET connected_to = array_append(
          array_remove(connected_to, (NEW.metadata->>'to_id')::UUID),  -- Dedupe
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

COMMENT ON FUNCTION public.apply_knowledge_event IS 'Computes knowledge_current state from event stream. Extracts session_id from metadata.';
