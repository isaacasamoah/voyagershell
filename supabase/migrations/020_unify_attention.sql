-- =============================================================================
-- Migration 020: Unify Attention Model (Mach 2 PR 4)
-- =============================================================================
--
-- attention_score is now the SINGLE canonical attention field.
-- Application code no longer reads is_active, is_pinned, or importance.
-- This migration updates the search_knowledge RPC to sort by attention_score
-- and removes the p_min_importance parameter (superseded by p_min_attention).
--
-- Columns is_active, is_pinned, importance are KEPT for data preservation.
-- They are no longer read by application code — just not dropped yet.
--
-- =============================================================================

-- =============================================================================
-- STEP 1: Replace search_knowledge RPC
-- Changes:
--   - ORDER BY now uses attention_score exclusively (not is_pinned + importance)
--   - Removed p_min_importance parameter (superseded by p_min_attention)
--   - Removed AND kc.importance >= p_min_importance WHERE clause
--   - Still returns is_active, is_pinned, importance columns (data preservation)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_knowledge(
  query_embedding vector(1536),
  p_user_id UUID DEFAULT NULL,
  p_voyage_slug TEXT DEFAULT NULL,
  p_include_quiet BOOLEAN DEFAULT FALSE,
  p_classifications TEXT[] DEFAULT NULL,
  p_match_threshold FLOAT DEFAULT 0.7,
  p_match_count INT DEFAULT 10,
  p_knowledge_type TEXT DEFAULT NULL,
  p_min_attention FLOAT DEFAULT 0.0
)
RETURNS TABLE (
  event_id UUID,
  content TEXT,
  classifications TEXT[],
  entities TEXT[],
  topics TEXT[],
  is_active BOOLEAN,
  is_pinned BOOLEAN,
  importance FLOAT,
  connected_to UUID[],
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
    kc.is_active,
    kc.is_pinned,
    kc.importance,
    kc.connected_to,
    kc.source_created_at,
    (1 - (kc.embedding <=> query_embedding))::FLOAT AS similarity,
    kc.knowledge_type,
    kc.attention_score,
    kc.context_snippet
  FROM public.knowledge_current kc
  WHERE
    -- Scope filter (personal or voyage)
    (
      (p_user_id IS NOT NULL AND kc.user_id = p_user_id) OR
      (p_voyage_slug IS NOT NULL AND kc.voyage_slug = p_voyage_slug)
    )
    -- Attention filter (exclude quiet unless requested)
    AND (p_include_quiet = TRUE OR kc.is_active = TRUE)
    -- Knowledge type filter
    AND (p_knowledge_type IS NULL OR kc.knowledge_type = p_knowledge_type)
    -- Attention score filter (replaces p_min_importance)
    AND kc.attention_score >= p_min_attention
    -- Classification filter (optional)
    AND (p_classifications IS NULL OR kc.classifications && p_classifications)
    -- Embedding must exist
    AND kc.embedding IS NOT NULL
    -- Similarity threshold
    AND (1 - (kc.embedding <=> query_embedding)) > p_match_threshold
  ORDER BY
    -- attention_score is the single canonical sort field
    kc.attention_score DESC,
    (1 - (kc.embedding <=> query_embedding)) DESC
  LIMIT p_match_count;
END;
$$;

COMMENT ON FUNCTION public.search_knowledge IS 'Semantic search over knowledge. attention_score is the single canonical sort/filter field.';

-- Ensure permissions are still granted
GRANT EXECUTE ON FUNCTION public.search_knowledge TO authenticated;
