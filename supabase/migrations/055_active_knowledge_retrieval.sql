DROP FUNCTION IF EXISTS public.search_knowledge(vector, uuid, text, boolean, text[], double precision, double precision, integer),
  public.search_knowledge(vector, uuid, text, boolean, text[], double precision, double precision, integer, text, double precision), public.search_knowledge(vector, uuid, text, text[], double precision, integer, text, double precision, uuid[]);
DROP FUNCTION IF EXISTS public.keyword_search(text, uuid, text, text, double precision, integer), public.keyword_search(text, uuid, text, text, double precision, integer, uuid[]);
DROP FUNCTION IF EXISTS public.scoped_knowledge_fetch(uuid, text, uuid[], text, text, boolean, timestamptz, timestamptz, double precision, integer);
DROP FUNCTION IF EXISTS public.scoped_knowledge_fetch(
  uuid, text, uuid[], text, text, boolean, timestamptz, timestamptz, double precision, integer, uuid);
DROP FUNCTION IF EXISTS public.graph_traverse(uuid, text, text, integer, double precision, integer, uuid, text, uuid[]);
ALTER TABLE public.knowledge_current DROP COLUMN IF EXISTS connected_to;
CREATE OR REPLACE FUNCTION public.knowledge_in_scope(
  p_row_user_id uuid, p_row_voyage_slug text, p_row_event_type text,
  p_row_knowledge_type text, p_row_participants uuid[], p_user_id uuid,
  p_voyage_slug text, p_participants uuid[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT (auth.uid() IS NULL OR auth.uid() = p_user_id) AND (
    (p_row_user_id = p_user_id AND p_row_voyage_slug IS NULL)
    OR (p_voyage_slug IS NOT NULL AND p_row_voyage_slug = p_voyage_slug
      AND EXISTS (SELECT 1 FROM public.voyage_members member
        JOIN public.voyages voyage ON voyage.id = member.voyage_id
        WHERE voyage.slug = p_voyage_slug AND member.user_id = p_user_id
          AND member.state = 'active')
      AND (p_row_user_id = p_user_id
        OR (p_row_event_type = 'explicit' AND p_row_knowledge_type IN ('domain', 'operational'))
        OR (p_row_event_type = 'message' AND (p_row_participants IS NULL
          OR p_user_id = ANY(p_row_participants))))))
$$;
CREATE OR REPLACE FUNCTION public.authorize_knowledge_scope(
  p_surface text, p_user_id uuid, p_voyage_slug text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_caller uuid := auth.uid();
  v_effective uuid := coalesce(v_caller, p_user_id);
BEGIN
  IF v_effective IS NULL THEN
    RAISE EXCEPTION '%: caller identity is required', p_surface USING ERRCODE = '42501';
  END IF;
  IF v_caller IS NOT NULL AND p_user_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION '%: p_user_id must equal auth.uid()', p_surface USING ERRCODE = '42501';
  END IF;
  IF p_voyage_slug IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.voyage_members member
    JOIN public.voyages voyage ON voyage.id = member.voyage_id
    WHERE voyage.slug = p_voyage_slug AND member.user_id = v_effective
      AND member.state = 'active') THEN
    RAISE EXCEPTION '%: caller is not an active voyage member', p_surface USING ERRCODE = '42501';
  END IF;
  RETURN v_effective;
END $$;
CREATE FUNCTION public.search_knowledge(
  query_embedding vector, p_user_id uuid,
  p_voyage_slug text DEFAULT NULL::text, p_classifications text[] DEFAULT NULL::text[],
  p_match_threshold double precision DEFAULT 0.7, p_match_count integer DEFAULT 10,
  p_knowledge_type text DEFAULT NULL::text, p_min_attention double precision DEFAULT 0.0)
RETURNS TABLE(event_id uuid, content text, classifications text[], entities text[], topics text[], participants uuid[],
  source_created_at timestamptz, similarity double precision, knowledge_type text, attention_score real, context_snippet text, sender_display_name text, sender_user_id uuid, event_type text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  p_user_id := public.authorize_knowledge_scope('search_knowledge', p_user_id, p_voyage_slug);
  RETURN QUERY SELECT row_value.event_id, row_value.content, row_value.classifications,
    row_value.entities, row_value.topics, row_value.participants, row_value.source_created_at,
    (1 - (row_value.embedding OPERATOR(public.<=>) query_embedding))::float, row_value.knowledge_type,
    row_value.attention_score, row_value.context_snippet, row_value.sender_display_name,
    row_value.sender_user_id, row_value.event_type
  FROM public.knowledge_current row_value
  WHERE public.knowledge_in_scope(row_value.user_id, row_value.voyage_slug, row_value.event_type,
      row_value.knowledge_type, row_value.participants, p_user_id, p_voyage_slug, ARRAY[p_user_id]::uuid[])
    AND row_value.attention_score >= p_min_attention
    AND (p_knowledge_type IS NULL OR row_value.knowledge_type = p_knowledge_type)
    AND (p_classifications IS NULL OR row_value.classifications && p_classifications)
    AND row_value.embedding IS NOT NULL
    AND (1 - (row_value.embedding OPERATOR(public.<=>) query_embedding)) > p_match_threshold
  ORDER BY row_value.attention_score DESC,
    (1 - (row_value.embedding OPERATOR(public.<=>) query_embedding)) DESC LIMIT p_match_count;
END $$;
CREATE FUNCTION public.keyword_search(
  p_query text, p_user_id uuid, p_voyage_slug text DEFAULT NULL::text,
  p_knowledge_type text DEFAULT NULL::text, p_min_attention double precision DEFAULT 0.0,
  p_match_count integer DEFAULT 50)
RETURNS TABLE(event_id uuid, content text, source_created_at timestamptz, rank_score double precision,
  classifications text[], entities text[], topics text[], knowledge_type text, attention_score double precision, context_snippet text, sender_display_name text, sender_user_id uuid, event_type text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  p_user_id := public.authorize_knowledge_scope('keyword_search', p_user_id, p_voyage_slug);
  RETURN QUERY SELECT row_value.event_id, row_value.content, row_value.source_created_at,
    ts_rank(row_value.search_vector, plainto_tsquery('english', p_query))::double precision,
    row_value.classifications, row_value.entities, row_value.topics, row_value.knowledge_type,
    row_value.attention_score::double precision, row_value.context_snippet,
    row_value.sender_display_name, row_value.sender_user_id, row_value.event_type
  FROM public.knowledge_current row_value
  WHERE row_value.search_vector @@ plainto_tsquery('english', p_query)
    AND row_value.attention_score >= p_min_attention
    AND public.knowledge_in_scope(row_value.user_id, row_value.voyage_slug, row_value.event_type,
      row_value.knowledge_type, row_value.participants, p_user_id, p_voyage_slug, ARRAY[p_user_id]::uuid[])
    AND (p_knowledge_type IS NULL OR row_value.knowledge_type = p_knowledge_type)
  ORDER BY 4 DESC LIMIT p_match_count;
END $$;
CREATE FUNCTION public.scoped_knowledge_fetch(
  p_user_id uuid, p_voyage_slug text DEFAULT NULL::text,
  p_scope text DEFAULT 'all', p_content_match text DEFAULT NULL::text,
  p_case_sensitive boolean DEFAULT false,
  p_since timestamptz DEFAULT NULL::timestamptz, p_until timestamptz DEFAULT NULL::timestamptz,
  p_min_attention double precision DEFAULT 0.0, p_match_count integer DEFAULT 100,
  p_sender_user_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(event_id uuid, content text, source_created_at timestamptz, classifications text[], entities text[],
  topics text[], knowledge_type text, attention_score double precision, context_snippet text, sender_display_name text, sender_user_id uuid, event_type text, session_id text, promotion_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  p_user_id := public.authorize_knowledge_scope('scoped_knowledge_fetch', p_user_id, p_voyage_slug);
  RETURN QUERY SELECT row_value.event_id, row_value.content, row_value.source_created_at,
    row_value.classifications, row_value.entities, row_value.topics, row_value.knowledge_type,
    row_value.attention_score::double precision, row_value.context_snippet,
    row_value.sender_display_name, row_value.sender_user_id, row_value.event_type,
    row_value.session_id, coalesce(row_value.promotion_count, 0)::integer
  FROM public.knowledge_current row_value
  WHERE row_value.attention_score >= p_min_attention
    AND (p_content_match IS NULL OR CASE WHEN p_case_sensitive
      THEN row_value.content LIKE p_content_match ELSE row_value.content ILIKE p_content_match END)
    AND (p_sender_user_id IS NULL OR row_value.sender_user_id = p_sender_user_id)
    AND (p_since IS NULL OR row_value.source_created_at >= p_since)
    AND (p_until IS NULL OR row_value.source_created_at <= p_until)
    AND ((p_scope = 'personal' AND row_value.user_id = p_user_id AND row_value.voyage_slug IS NULL)
      OR (p_scope IN ('voyage', 'all') AND public.knowledge_in_scope(row_value.user_id,
        row_value.voyage_slug, row_value.event_type, row_value.knowledge_type,
        row_value.participants, p_user_id, p_voyage_slug, ARRAY[p_user_id]::uuid[])
        AND (p_scope = 'all' OR row_value.voyage_slug IS NOT NULL)))
  ORDER BY row_value.attention_score DESC, row_value.source_created_at DESC LIMIT p_match_count;
END $$;
CREATE FUNCTION public.get_knowledge_by_ids(
  p_event_ids uuid[], p_user_id uuid, p_voyage_slug text)
RETURNS TABLE(event_id uuid, content text, source_created_at timestamptz, classifications text[], entities text[],
  topics text[], knowledge_type text, attention_score real, context_snippet text, sender_display_name text, sender_user_id uuid, event_type text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  p_user_id := public.authorize_knowledge_scope('get_knowledge_by_ids', p_user_id, p_voyage_slug);
  RETURN QUERY SELECT row_value.event_id, row_value.content, row_value.source_created_at,
    row_value.classifications, row_value.entities, row_value.topics, row_value.knowledge_type,
    row_value.attention_score, row_value.context_snippet, row_value.sender_display_name,
    row_value.sender_user_id, row_value.event_type
  FROM public.knowledge_current row_value
  WHERE row_value.event_id = ANY(p_event_ids)
    AND public.knowledge_in_scope(row_value.user_id, row_value.voyage_slug, row_value.event_type,
      row_value.knowledge_type, row_value.participants, p_user_id, p_voyage_slug, ARRAY[p_user_id]::uuid[])
  ORDER BY array_position(p_event_ids, row_value.event_id);
END $$;
CREATE FUNCTION public.get_voyage_messages(
  p_user_id uuid, p_voyage_slug text, p_since timestamptz, p_max_count integer)
RETURNS TABLE(event_id uuid, content text, source_created_at timestamptz,
  sender_display_name text, sender_user_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_voyage_slug IS NULL THEN
    RAISE EXCEPTION 'get_voyage_messages: voyage is required' USING ERRCODE = '22023';
  END IF;
  p_user_id := public.authorize_knowledge_scope('get_voyage_messages', p_user_id, p_voyage_slug);
  RETURN QUERY SELECT row_value.event_id, row_value.content, row_value.source_created_at,
    row_value.sender_display_name, row_value.sender_user_id
  FROM public.knowledge_current row_value
  WHERE row_value.event_type = 'message' AND row_value.voyage_slug = p_voyage_slug
    AND row_value.source_created_at >= p_since AND row_value.sender_user_id <> p_user_id
    AND p_user_id = ANY(row_value.addressed_to)
    AND public.knowledge_in_scope(row_value.user_id, row_value.voyage_slug, row_value.event_type,
      row_value.knowledge_type, row_value.participants, p_user_id, p_voyage_slug, ARRAY[p_user_id]::uuid[])
  ORDER BY row_value.source_created_at DESC LIMIT least(greatest(p_max_count, 1), 50);
END $$;
CREATE FUNCTION public.graph_traverse(
  p_node_id uuid, p_user_id uuid, p_voyage_slug text, p_edge_type text DEFAULT NULL,
  p_direction text DEFAULT 'both', p_depth integer DEFAULT 1,
  p_min_attention double precision DEFAULT 0.3, p_max_nodes integer DEFAULT 50)
RETURNS TABLE(event_id uuid, content text, source_created_at timestamptz,
  knowledge_type text, attention_score real, context_snippet text,
  edge_type text, edge_direction text, hop integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_frontier uuid[] := ARRAY[p_node_id];
  v_next uuid[];
  v_seen uuid[] := ARRAY[p_node_id];
  v_edge record;
  v_hop integer := 0;
  v_remaining integer;
BEGIN
  p_user_id := public.authorize_knowledge_scope('graph_traverse', p_user_id, p_voyage_slug);
  IF p_direction NOT IN ('outgoing', 'incoming', 'both') OR p_depth < 1 OR p_max_nodes < 1 THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.knowledge_current root
    WHERE root.event_id = p_node_id AND public.knowledge_in_scope(root.user_id,
      root.voyage_slug, root.event_type, root.knowledge_type, root.participants,
      p_user_id, p_voyage_slug, ARRAY[p_user_id]::uuid[]))
  THEN
    RETURN;
  END IF;
  v_remaining := least(p_max_nodes, 50);
  WHILE v_hop < least(p_depth, 3) AND v_remaining > 0 AND cardinality(v_frontier) > 0 LOOP
    v_hop := v_hop + 1;
    v_next := ARRAY[]::uuid[];
    FOR v_edge IN SELECT node.event_id AS found_id, node.content AS found_content,
        node.source_created_at AS found_at, node.knowledge_type AS found_kind,
        node.attention_score AS found_attention, node.context_snippet AS found_context,
        edge.edge_type AS found_edge, CASE WHEN edge.source_id = frontier.id
          THEN 'outgoing' ELSE 'incoming' END AS found_direction
      FROM unnest(v_frontier) frontier(id)
      JOIN public.knowledge_edges edge ON
        (edge.source_id = frontier.id AND p_direction IN ('outgoing', 'both'))
        OR (edge.target_id = frontier.id AND p_direction IN ('incoming', 'both'))
      JOIN public.knowledge_current node ON node.event_id = CASE
        WHEN edge.source_id = frontier.id THEN edge.target_id ELSE edge.source_id END
      WHERE node.event_id <> ALL(v_seen) AND (p_edge_type IS NULL OR edge.edge_type = p_edge_type)
        AND node.attention_score >= p_min_attention
        AND public.knowledge_in_scope(node.user_id, node.voyage_slug, node.event_type,
          node.knowledge_type, node.participants, p_user_id, p_voyage_slug, ARRAY[p_user_id]::uuid[])
      ORDER BY node.event_id, edge.edge_type, found_direction LIMIT v_remaining
    LOOP
      IF v_edge.found_id = ANY(v_seen) THEN
        CONTINUE;
      END IF;
      v_seen := array_append(v_seen, v_edge.found_id);
      v_next := array_append(v_next, v_edge.found_id);
      v_remaining := v_remaining - 1;
      event_id := v_edge.found_id;
      content := v_edge.found_content;
      source_created_at := v_edge.found_at;
      knowledge_type := v_edge.found_kind;
      attention_score := v_edge.found_attention;
      context_snippet := v_edge.found_context;
      edge_type := v_edge.found_edge;
      edge_direction := v_edge.found_direction;
      hop := v_hop;
      RETURN NEXT;
      EXIT WHEN v_remaining = 0;
    END LOOP;
    v_frontier := v_next;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.knowledge_in_scope(uuid, text, text, text, uuid[], uuid, text, uuid[]),
  public.authorize_knowledge_scope(text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.search_knowledge(vector, uuid, text, text[], double precision,
  integer, text, double precision), public.keyword_search(text, uuid, text, text,
  double precision, integer), public.scoped_knowledge_fetch(uuid, text, text,
  text, boolean, timestamptz, timestamptz, double precision, integer, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_knowledge(vector, uuid, text, text[], double precision,
  integer, text, double precision), public.keyword_search(text, uuid, text, text,
  double precision, integer), public.scoped_knowledge_fetch(uuid, text, text,
  text, boolean, timestamptz, timestamptz, double precision, integer, uuid)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_knowledge_by_ids(uuid[], uuid, text),
  public.get_voyage_messages(uuid, text, timestamptz, integer),
  public.graph_traverse(uuid, uuid, text, text, text, integer, double precision, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_knowledge_by_ids(uuid[], uuid, text),
  public.get_voyage_messages(uuid, text, timestamptz, integer),
  public.graph_traverse(uuid, uuid, text, text, text, integer, double precision, integer) TO service_role;
