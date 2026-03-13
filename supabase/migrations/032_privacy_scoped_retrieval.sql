-- =============================================================================
-- Migration 032: Privacy-Scoped Retrieval
-- =============================================================================
--
-- Evolve search_knowledge + keyword_search RPCs to enforce 4-layer privacy:
--   Layer 1: Personal space — user_id = me AND voyage_slug IS NULL
--   Layer 2: My voyage content — voyage_slug = X AND user_id = me
--   Layer 3: Shared explicit — voyage_slug = X AND event_type = 'explicit'
--            AND knowledge_type IN ('domain', 'operational')
--   Layer 4: My messages — voyage_slug = X AND event_type = 'message'
--            AND (participants IS NULL OR participants contains me)
--
-- Privacy invariant: event_type is the stable privacy dimension.
-- Conversations are ALWAYS author-only. Only explicit domain/operational
-- events are voyage-wide. Unenriched (NULL knowledge_type) defaults to
-- author-only.
--
-- =============================================================================

-- Drop existing search_knowledge to replace WHERE clause
DROP FUNCTION IF EXISTS public.search_knowledge(
  vector(1536), UUID, TEXT, TEXT[], FLOAT, INT, TEXT, FLOAT, UUID[]
);

CREATE FUNCTION public.search_knowledge(
  query_embedding vector(1536),
  p_user_id UUID DEFAULT NULL,
  p_voyage_slug TEXT DEFAULT NULL,
  p_classifications TEXT[] DEFAULT NULL,
  p_match_threshold FLOAT DEFAULT 0.7,
  p_match_count INT DEFAULT 10,
  p_knowledge_type TEXT DEFAULT NULL,
  p_min_attention FLOAT DEFAULT 0.0,
  p_participants UUID[] DEFAULT NULL
)
RETURNS TABLE (
  event_id UUID,
  content TEXT,
  classifications TEXT[],
  entities TEXT[],
  topics TEXT[],
  connected_to UUID[],
  participants UUID[],
  source_created_at TIMESTAMPTZ,
  similarity FLOAT,
  knowledge_type TEXT,
  attention_score REAL,
  context_snippet TEXT,
  sender_display_name TEXT,
  sender_user_id UUID,
  event_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.event_id,
    kc.content,
    kc.classifications,
    kc.entities,
    kc.topics,
    kc.connected_to,
    kc.participants,
    kc.source_created_at,
    (1 - (kc.embedding <=> query_embedding))::FLOAT AS similarity,
    kc.knowledge_type,
    kc.attention_score,
    kc.context_snippet,
    kc.sender_display_name,
    kc.sender_user_id,
    kc.event_type
  FROM public.knowledge_current kc
  WHERE
    -- 4-layer privacy-scoped filter
    (
      -- Layer 1: Personal space (voyage_slug IS NULL)
      (p_user_id IS NOT NULL AND kc.user_id = p_user_id AND kc.voyage_slug IS NULL)
      OR
      -- Layer 2: My own content in this voyage
      (p_voyage_slug IS NOT NULL AND kc.voyage_slug = p_voyage_slug AND kc.user_id = p_user_id)
      OR
      -- Layer 3: Shared explicit domain/operational from any member
      (p_voyage_slug IS NOT NULL AND kc.voyage_slug = p_voyage_slug
        AND kc.event_type = 'explicit'
        AND kc.knowledge_type IN ('domain', 'operational'))
      OR
      -- Layer 4: Messages where I'm a participant
      (p_voyage_slug IS NOT NULL AND kc.voyage_slug = p_voyage_slug
        AND kc.event_type = 'message'
        AND (kc.participants IS NULL OR p_participants && kc.participants))
    )
    -- Attention score filter
    AND kc.attention_score >= p_min_attention
    -- Knowledge type filter
    AND (p_knowledge_type IS NULL OR kc.knowledge_type = p_knowledge_type)
    -- Classification filter (optional)
    AND (p_classifications IS NULL OR kc.classifications && p_classifications)
    -- Embedding must exist
    AND kc.embedding IS NOT NULL
    -- Similarity threshold
    AND (1 - (kc.embedding <=> query_embedding)) > p_match_threshold
  ORDER BY
    kc.attention_score DESC,
    (1 - (kc.embedding <=> query_embedding)) DESC
  LIMIT p_match_count;
END;
$$;

COMMENT ON FUNCTION public.search_knowledge IS 'Semantic search with 4-layer privacy scoping: personal, my voyage content, shared explicit domain/operational, participant-scoped messages.';

GRANT EXECUTE ON FUNCTION public.search_knowledge TO authenticated;


-- =============================================================================
-- keyword_search — same 4-layer privacy filter
-- =============================================================================

CREATE OR REPLACE FUNCTION keyword_search(
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
  connected_to UUID[],
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
    ts_rank(kc.search_vector, plainto_tsquery('english', p_query)) AS rank_score,
    kc.classifications,
    kc.entities,
    kc.topics,
    kc.connected_to,
    kc.knowledge_type,
    kc.attention_score,
    kc.context_snippet,
    kc.sender_display_name,
    kc.sender_user_id,
    kc.event_type
  FROM knowledge_current kc
  WHERE kc.search_vector @@ plainto_tsquery('english', p_query)
    AND kc.attention_score >= p_min_attention
    -- 4-layer privacy-scoped filter
    AND (
      -- Layer 1: Personal space
      (kc.user_id = p_user_id AND kc.voyage_slug IS NULL)
      OR
      -- Layer 2: My own content in this voyage
      (kc.voyage_slug = p_voyage_slug AND kc.user_id = p_user_id)
      OR
      -- Layer 3: Shared explicit domain/operational from any member
      (kc.voyage_slug = p_voyage_slug
        AND kc.event_type = 'explicit'
        AND kc.knowledge_type IN ('domain', 'operational'))
      OR
      -- Layer 4: Messages where I'm a participant
      (kc.voyage_slug = p_voyage_slug
        AND kc.event_type = 'message'
        AND (kc.participants IS NULL OR p_participants && kc.participants))
    )
    AND (p_knowledge_type IS NULL OR kc.knowledge_type = p_knowledge_type)
  ORDER BY rank_score DESC
  LIMIT p_match_count;
END;
$$;
