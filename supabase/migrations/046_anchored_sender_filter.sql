CREATE OR REPLACE FUNCTION public.scoped_knowledge_fetch(
  p_user_id UUID,
  p_voyage_slug TEXT DEFAULT NULL,
  p_participants UUID[] DEFAULT NULL,
  p_scope TEXT DEFAULT 'all',
  p_content_match TEXT DEFAULT NULL,
  p_case_sensitive BOOLEAN DEFAULT FALSE,
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_until TIMESTAMPTZ DEFAULT NULL,
  p_min_attention FLOAT DEFAULT 0.0,
  p_match_count INT DEFAULT 100,
  p_sender_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  event_id UUID,
  content TEXT,
  source_created_at TIMESTAMPTZ,
  classifications TEXT[],
  entities TEXT[],
  topics TEXT[],
  knowledge_type TEXT,
  attention_score FLOAT,
  context_snippet TEXT,
  sender_display_name TEXT,
  sender_user_id UUID,
  event_type TEXT,
  session_id TEXT,
  promotion_count INT
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    kc.event_id,
    kc.content,
    kc.source_created_at,
    kc.classifications,
    kc.entities,
    kc.topics,
    kc.knowledge_type,
    kc.attention_score::FLOAT,
    kc.context_snippet,
    kc.sender_display_name,
    kc.sender_user_id,
    kc.event_type,
    kc.session_id,
    COALESCE(kc.promotion_count, 0)::INT AS promotion_count
  FROM public.knowledge_current kc
  WHERE kc.attention_score >= p_min_attention
    AND (
      p_content_match IS NULL
      OR (
        CASE
          WHEN p_case_sensitive THEN kc.content LIKE p_content_match
          ELSE kc.content ILIKE p_content_match
        END
      )
    )
    AND (p_sender_user_id IS NULL OR kc.sender_user_id = p_sender_user_id)
    AND (p_since IS NULL OR kc.source_created_at >= p_since)
    AND (p_until IS NULL OR kc.source_created_at <= p_until)
    AND (
      (p_scope = 'personal' AND kc.user_id = p_user_id AND kc.voyage_slug IS NULL)
      OR (
        p_scope = 'voyage'
        AND knowledge_in_scope(kc.user_id, kc.voyage_slug, kc.event_type, kc.knowledge_type, kc.participants, p_user_id, p_voyage_slug, p_participants)
        -- Exclude the personal layer only when a voyage is actually named. With a
        -- NULL slug, 'voyage' degrades to personal (knowledge_in_scope returns only
        -- L1 rows) — matching the pre-unification keywordGrep fallback behavior.
        AND (p_voyage_slug IS NULL OR kc.voyage_slug IS NOT NULL)
      )
      OR (
        p_scope = 'all'
        AND knowledge_in_scope(kc.user_id, kc.voyage_slug, kc.event_type, kc.knowledge_type, kc.participants, p_user_id, p_voyage_slug, p_participants)
      )
    )
  ORDER BY kc.attention_score DESC, kc.source_created_at DESC
  LIMIT p_match_count;
END;
$function$;
