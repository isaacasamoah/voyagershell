-- APPLY ONLY AT PROD PROMOTION - prod still reads connected_to until Cut 3a ships to main.
--
-- PREREQUISITE: migration 045 MUST already be applied before this runs — the
-- keyword_search body below calls knowledge_in_scope(), which 045 creates. On the
-- shared dev+prod DB 045 is already applied, so this is satisfied; a fresh-DB
-- number-order replay must apply 045 first.
--
-- Cut 3a legacy cleanup:
-- - 037_messaging_v2_drop_weave.sql:88-101 left an event_type='connection'
--   trigger branch that writes knowledge_current.connected_to.
-- - 030_knowledge_v2_search.sql returned and selected connected_to from
--   keyword_search.
-- Once prod runs code that no longer reads the array, replace those function
-- surfaces and drop the column in one deferred migration.

-- Remove the legacy connection-event branch from the knowledge event trigger.
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
  -- SOURCE EVENTS: Create knowledge_current row (the content IS the knowledge)
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
  END IF;

  RETURN NEW;
END;
$function$;

-- Recreate keyword_search without the legacy array in its return surface.
DROP FUNCTION IF EXISTS public.keyword_search(TEXT, UUID, TEXT, TEXT, DOUBLE PRECISION, INTEGER, UUID[]);

CREATE OR REPLACE FUNCTION public.keyword_search(
  p_query TEXT,
  p_user_id UUID,
  p_voyage_slug TEXT DEFAULT NULL,
  p_knowledge_type TEXT DEFAULT NULL,
  p_min_attention FLOAT DEFAULT 0.0,
  p_match_count INT DEFAULT 50,
  p_participants UUID[] DEFAULT NULL
)
RETURNS TABLE (
  event_id UUID,
  content TEXT,
  source_created_at TIMESTAMPTZ,
  rank_score FLOAT,
  classifications TEXT[],
  entities TEXT[],
  topics TEXT[],
  knowledge_type TEXT,
  attention_score FLOAT,
  context_snippet TEXT,
  sender_display_name TEXT,
  sender_user_id UUID,
  event_type TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.event_id,
    kc.content,
    kc.source_created_at,
    ts_rank(kc.search_vector, plainto_tsquery('english', p_query))::double precision AS rank_score,
    kc.classifications,
    kc.entities,
    kc.topics,
    kc.knowledge_type,
    kc.attention_score::double precision,
    kc.context_snippet,
    kc.sender_display_name,
    kc.sender_user_id,
    kc.event_type
  FROM knowledge_current kc
  WHERE kc.search_vector @@ plainto_tsquery('english', p_query)
    AND kc.attention_score >= p_min_attention
    AND knowledge_in_scope(kc.user_id, kc.voyage_slug, kc.event_type, kc.knowledge_type, kc.participants, p_user_id, p_voyage_slug, p_participants)
    AND (p_knowledge_type IS NULL OR kc.knowledge_type = p_knowledge_type)
  ORDER BY rank_score DESC
  LIMIT p_match_count;
END;
$$;

ALTER TABLE public.knowledge_current DROP COLUMN IF EXISTS connected_to;
