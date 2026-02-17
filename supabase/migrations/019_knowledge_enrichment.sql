-- =============================================================================
-- Migration 019: Knowledge Enrichment (Mach 2 PR 1)
-- =============================================================================
--
-- Adds knowledge_type, attention_score, and context_snippet to knowledge_current.
-- These columns power post-session agent classification and smart pre-retrieval.
--
-- knowledge_type: domain | operational | preference
-- attention_score: 0.0-1.0 continuous (replaces is_active/is_pinned/importance as single signal)
-- context_snippet: one-line contextualisation prepended before re-embedding
--
-- =============================================================================

-- =============================================================================
-- STEP 1: Add columns to knowledge_current
-- =============================================================================

ALTER TABLE public.knowledge_current
  ADD COLUMN knowledge_type TEXT CHECK (knowledge_type IN ('domain', 'operational', 'preference')),
  ADD COLUMN attention_score REAL DEFAULT 0.5,
  ADD COLUMN context_snippet TEXT;

COMMENT ON COLUMN public.knowledge_current.knowledge_type IS 'domain | operational | preference — set by post-session agent';
COMMENT ON COLUMN public.knowledge_current.attention_score IS '0.0-1.0 continuous attention. Replaces is_active/is_pinned/importance as single retrieval signal.';
COMMENT ON COLUMN public.knowledge_current.context_snippet IS 'One-line contextualisation prepended before re-embedding (Anthropic contextual retrieval pattern)';

-- =============================================================================
-- STEP 2: Backfill knowledge_type from existing classifications array
-- Priority: preference > insight (maps to domain) > everything else (operational)
-- =============================================================================

UPDATE public.knowledge_current SET knowledge_type = CASE
  WHEN 'preference' = ANY(classifications) THEN 'preference'
  WHEN 'insight' = ANY(classifications) THEN 'domain'
  ELSE 'operational'
END;

-- =============================================================================
-- STEP 3: Backfill attention_score from existing attention state
-- pinned → 1.0, inactive → 0.1, else → existing importance value
-- =============================================================================

UPDATE public.knowledge_current SET attention_score = CASE
  WHEN is_pinned = true THEN 1.0
  WHEN is_active = false THEN 0.1
  ELSE importance
END;

-- context_snippet stays NULL for existing data.
-- Requires conversational context to generate properly.
-- Future post-session agent runs will fill these in.

-- =============================================================================
-- STEP 4: Index for type-first filtering
-- No WHERE is_active filter — attention_score encodes activity state now
-- (inactive rows got 0.1, deep search queries with threshold >= 0 can still reach them)
-- =============================================================================

CREATE INDEX idx_knowledge_type_attention
  ON public.knowledge_current (knowledge_type, attention_score DESC);

-- =============================================================================
-- STEP 5: JSONB index for post-session agent performance
-- session_id lives in metadata JSONB, not a column
-- =============================================================================

CREATE INDEX idx_events_session_id
  ON public.knowledge_events ((metadata->>'session_id'));

-- =============================================================================
-- STEP 6: Update search_knowledge RPC with new filter params
-- Adds p_knowledge_type and p_min_attention alongside existing params
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_knowledge(
  query_embedding vector(1536),
  p_user_id UUID DEFAULT NULL,
  p_voyage_slug TEXT DEFAULT NULL,
  p_include_quiet BOOLEAN DEFAULT FALSE,
  p_classifications TEXT[] DEFAULT NULL,
  p_min_importance FLOAT DEFAULT 0.0,
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
    -- Importance filter (legacy)
    AND kc.importance >= p_min_importance
    -- Knowledge type filter (new)
    AND (p_knowledge_type IS NULL OR kc.knowledge_type = p_knowledge_type)
    -- Attention score filter (new)
    AND kc.attention_score >= p_min_attention
    -- Classification filter (optional)
    AND (p_classifications IS NULL OR kc.classifications && p_classifications)
    -- Embedding must exist
    AND kc.embedding IS NOT NULL
    -- Similarity threshold
    AND (1 - (kc.embedding <=> query_embedding)) > p_match_threshold
  ORDER BY
    -- Pinned first, then by similarity weighted by importance
    kc.is_pinned DESC,
    (1 - (kc.embedding <=> query_embedding)) * (0.7 + 0.3 * kc.importance) DESC
  LIMIT p_match_count;
END;
$$;

COMMENT ON FUNCTION public.search_knowledge IS 'Semantic search over knowledge. Supports knowledge_type and attention_score filtering.';

-- Ensure permissions are still granted
GRANT EXECUTE ON FUNCTION public.search_knowledge TO authenticated;
