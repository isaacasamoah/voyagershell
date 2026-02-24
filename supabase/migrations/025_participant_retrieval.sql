-- =============================================================================
-- Migration 025: Participant-Scoped Retrieval (Voyage 2)
-- =============================================================================
--
-- Wire p_participants into search_knowledge RPC:
--   1. Fix personal scope: add voyage_slug IS NULL (prevents cross-voyage bleed)
--   2. Wire participant filtering on voyage-scoped results
--   3. Backward compatible: p_participants NULL = no filtering
--
-- =============================================================================

-- Must DROP first since WHERE clause logic changes
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
  context_snippet TEXT
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
    kc.context_snippet
  FROM public.knowledge_current kc
  WHERE
    -- Two-layer scope filter (Decision 8: personal + voyage)
    (
      -- Layer 1: Personal knowledge (voyage_slug IS NULL prevents cross-voyage bleed)
      (p_user_id IS NOT NULL AND kc.user_id = p_user_id AND kc.voyage_slug IS NULL)
      OR
      -- Layer 2: Voyage knowledge (participant-scoped)
      (p_voyage_slug IS NOT NULL AND kc.voyage_slug = p_voyage_slug
        AND (
          p_participants IS NULL           -- backward compat: no filter when not provided
          OR kc.participants IS NULL        -- public within voyage (everyone sees it)
          OR p_participants && kc.participants  -- overlap: user is in participant list
        )
      )
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

COMMENT ON FUNCTION public.search_knowledge IS 'Semantic search with two-layer scoping: personal (voyage_slug NULL) + voyage (participant-filtered). GIN indexes on participants used for overlap.';

GRANT EXECUTE ON FUNCTION public.search_knowledge TO authenticated;
