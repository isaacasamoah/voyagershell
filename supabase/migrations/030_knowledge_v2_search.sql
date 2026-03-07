-- Migration 030: Knowledge v2 Search Infrastructure
-- Features 1 + 3 combined (search_vector + edges table)

-- Feature 1: tsvector for hybrid keyword search
ALTER TABLE knowledge_current
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

UPDATE knowledge_current
  SET search_vector = to_tsvector('english',
    coalesce(context_snippet, '') || ' ' || coalesce(content, '')
  )
  WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_current_search_vector
  ON knowledge_current USING gin(search_vector);

CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.context_snippet, '') || ' ' || coalesce(NEW.content, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_search_vector ON knowledge_current;
CREATE TRIGGER trg_update_search_vector
  BEFORE INSERT OR UPDATE OF content, context_snippet
  ON knowledge_current
  FOR EACH ROW
  EXECUTE FUNCTION update_search_vector();

-- Feature 1b: keyword_search RPC with ts_rank scoring
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
    AND (
      (kc.user_id = p_user_id AND kc.voyage_slug IS NULL)
      OR (
        kc.voyage_slug = p_voyage_slug
        AND (kc.participants IS NULL OR p_participants && kc.participants)
      )
    )
    AND (p_knowledge_type IS NULL OR kc.knowledge_type = p_knowledge_type)
  ORDER BY rank_score DESC
  LIMIT p_match_count;
END;
$$;

-- Feature 3: Typed directional edges
CREATE TABLE IF NOT EXISTS knowledge_edges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES knowledge_events(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES knowledge_events(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL CHECK (edge_type IN (
    'supersedes', 'supports', 'contradicts', 'elaborates',
    'triggered_by', 'relates_to', 'decided_by', 'raised_by'
  )),
  created_by TEXT NOT NULL DEFAULT 'cartographer',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_id, target_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_edges_source ON knowledge_edges(source_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_edges_target ON knowledge_edges(target_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_edges_type ON knowledge_edges(edge_type);

-- Feature 4: Recursive graph traversal RPC
CREATE OR REPLACE FUNCTION graph_traverse(
  p_node_id UUID,
  p_edge_type TEXT DEFAULT NULL,
  p_direction TEXT DEFAULT 'both',
  p_depth INT DEFAULT 1,
  p_min_attention FLOAT DEFAULT 0.3,
  p_max_nodes INT DEFAULT 50
)
RETURNS TABLE (
  event_id UUID,
  content TEXT,
  source_created_at TIMESTAMPTZ,
  knowledge_type TEXT,
  attention_score FLOAT,
  context_snippet TEXT,
  edge_type TEXT,
  edge_direction TEXT,
  hop INT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE traversal AS (
    -- Base case: direct edges from/to the start node
    SELECT
      CASE
        WHEN p_direction IN ('outgoing', 'both') AND e.source_id = p_node_id THEN e.target_id
        WHEN p_direction IN ('incoming', 'both') AND e.target_id = p_node_id THEN e.source_id
      END AS node_id,
      e.edge_type AS e_type,
      CASE
        WHEN e.source_id = p_node_id THEN 'outgoing'
        ELSE 'incoming'
      END AS e_direction,
      1 AS depth
    FROM knowledge_edges e
    WHERE (
      (p_direction IN ('outgoing', 'both') AND e.source_id = p_node_id)
      OR (p_direction IN ('incoming', 'both') AND e.target_id = p_node_id)
    )
    AND (p_edge_type IS NULL OR e.edge_type = p_edge_type)

    UNION

    -- Recursive case: follow edges from discovered nodes
    SELECT
      CASE
        WHEN e.source_id = t.node_id THEN e.target_id
        ELSE e.source_id
      END AS node_id,
      e.edge_type AS e_type,
      CASE
        WHEN e.source_id = t.node_id THEN 'outgoing'
        ELSE 'incoming'
      END AS e_direction,
      t.depth + 1 AS depth
    FROM knowledge_edges e
    INNER JOIN traversal t ON (
      (e.source_id = t.node_id AND p_direction IN ('outgoing', 'both'))
      OR (e.target_id = t.node_id AND p_direction IN ('incoming', 'both'))
    )
    WHERE t.depth < p_depth
      AND (p_edge_type IS NULL OR e.edge_type = p_edge_type)
      -- Prevent cycles: don't revisit the start node
      AND CASE
        WHEN e.source_id = t.node_id THEN e.target_id
        ELSE e.source_id
      END != p_node_id
  )
  SELECT DISTINCT ON (kc.event_id)
    kc.event_id,
    kc.content,
    kc.source_created_at,
    kc.knowledge_type,
    kc.attention_score,
    kc.context_snippet,
    t.e_type AS edge_type,
    t.e_direction AS edge_direction,
    t.depth AS hop
  FROM traversal t
  INNER JOIN knowledge_current kc ON kc.event_id = t.node_id
  WHERE kc.attention_score >= p_min_attention
    AND t.node_id IS NOT NULL
  ORDER BY kc.event_id, t.depth ASC
  LIMIT p_max_nodes;
END;
$$;
