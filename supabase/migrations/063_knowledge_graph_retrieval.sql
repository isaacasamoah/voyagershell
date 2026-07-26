-- Content-safe traversal and retrieval. Returned rows contain no graph metadata.
-- Additive: the legacy traversal RPC and its caller stay whole until the cutover.
CREATE FUNCTION public.viewer_has_graph_node_grant(p_node_id uuid, p_viewer_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p_viewer_profile_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.graph_node_grants grant_row
    JOIN public.knowledge_audiences audience
      ON audience.id = grant_row.knowledge_audience_id
    WHERE grant_row.node_id = p_node_id
      AND p_viewer_profile_id = ANY(audience.member_profile_ids)
      AND (public.graph_node_source_audience(p_node_id) IS NULL
        OR grant_row.knowledge_audience_id = public.graph_node_source_audience(p_node_id)))
$$;

CREATE FUNCTION public.graph_authority_edge_is_current(
  p_edge_id uuid, p_viewer_profile_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.graph_authority_edges edge
    JOIN public.graph_nodes source_node ON source_node.id = edge.source_node_id
    JOIN public.graph_nodes target_node ON target_node.id = edge.target_node_id
    JOIN public.knowledge_audiences audience ON audience.id = edge.knowledge_audience_id
    WHERE edge.id = p_edge_id AND audience.purpose = 'authority'
      AND p_viewer_profile_id = ANY(audience.member_profile_ids)
      AND CASE edge.authority_kind
        WHEN 'voyage_member' THEN EXISTS (
          SELECT 1 FROM public.voyage_members member
          WHERE member.id = edge.authority_row_id AND member.state = 'active'
            AND edge.kind = 'member_of'
            AND member.revision = edge.authority_revision
            AND member.state = edge.state AND member.state_changed_at = edge.effective_at
            AND source_node.kind = 'person' AND source_node.authority_id = member.user_id
            AND target_node.kind = 'voyage' AND target_node.authority_id = member.voyage_id
            AND audience.scope_kind = 'voyage' AND audience.scope_authority_id = member.voyage_id
            AND audience.member_profile_ids = coalesce((SELECT
              public.normalize_knowledge_audience_members(array_agg(active.user_id))
              FROM public.voyage_members active WHERE active.voyage_id = member.voyage_id
                AND active.state = 'active'), '{}'::uuid[]))
        WHEN 'space_member' THEN EXISTS (
          SELECT 1 FROM public.space_members member
          WHERE member.id = edge.authority_row_id
            AND public.is_effective_space_member(member.space_id, member.user_id)
            AND edge.kind = 'member_of'
            AND member.revision = edge.authority_revision
            AND member.state = edge.state AND member.state_changed_at = edge.effective_at
            AND source_node.kind = 'person' AND source_node.authority_id = member.user_id
            AND target_node.kind = 'space' AND target_node.authority_id = member.space_id
            AND audience.scope_kind = 'space' AND audience.scope_authority_id = member.space_id
            AND audience.member_profile_ids = coalesce((SELECT
              public.normalize_knowledge_audience_members(array_agg(active.user_id))
              FROM public.space_members active WHERE active.space_id = member.space_id
                AND public.is_effective_space_member(active.space_id, active.user_id)), '{}'::uuid[]))
        WHEN 'space' THEN edge.kind = 'in_voyage'
          AND edge.authority_revision = 1 AND edge.state = 'active'
          AND EXISTS (SELECT 1 FROM public.spaces space
            WHERE space.id = edge.authority_row_id AND space.created_at = edge.effective_at
              AND source_node.kind = 'space' AND source_node.authority_id = space.id
              AND target_node.kind = 'voyage' AND target_node.authority_id = space.voyage_id
              AND audience.scope_kind = 'space' AND audience.scope_authority_id = space.id
              AND audience.member_profile_ids = coalesce((SELECT
                public.normalize_knowledge_audience_members(array_agg(active.user_id))
                FROM public.space_members active WHERE active.space_id = space.id
                  AND public.is_effective_space_member(active.space_id, active.user_id)), '{}'::uuid[]))
        WHEN 'profile' THEN edge.kind = 'companion_of'
          AND edge.authority_revision = 1 AND edge.state = 'active'
          AND EXISTS (SELECT 1 FROM public.profiles profile
            WHERE profile.id = edge.authority_row_id AND profile.created_at = edge.effective_at
              AND source_node.kind = 'voyager' AND source_node.authority_id = profile.id
              AND target_node.kind = 'person' AND target_node.authority_id = profile.id
              AND audience.scope_kind = 'private' AND audience.scope_authority_id = profile.id
              AND audience.member_profile_ids = ARRAY[profile.id]::uuid[])
        ELSE false END)
$$;

CREATE FUNCTION public.viewer_has_current_graph_node(p_node_id uuid, p_viewer_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public.graph_authority_edges edge
    WHERE (edge.source_node_id = p_node_id OR edge.target_node_id = p_node_id)
      AND public.graph_authority_edge_is_current(edge.id, p_viewer_profile_id))
$$;

CREATE FUNCTION public.graph_node_label_for_viewer(p_node_id uuid, p_viewer_profile_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT CASE WHEN public.viewer_has_current_graph_node(node.id, p_viewer_profile_id)
    THEN node.label ELSE (
      SELECT grant_row.label_snapshot FROM public.graph_node_grants grant_row
      JOIN public.knowledge_audiences audience ON audience.id = grant_row.knowledge_audience_id
      WHERE grant_row.node_id = node.id
        AND p_viewer_profile_id = ANY(audience.member_profile_ids)
      ORDER BY grant_row.granted_at DESC, grant_row.basis_version DESC,
        grant_row.knowledge_audience_id DESC LIMIT 1) END
  FROM public.graph_nodes node WHERE node.id = p_node_id
$$;

CREATE FUNCTION public.authorized_graph_neighbors(
  p_node_id uuid, p_viewer_profile_id uuid, p_edge_kinds public.graph_edge_kind[]
) RETURNS TABLE(node_id uuid) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
  SELECT CASE WHEN edge.source_node_id = p_node_id
    THEN edge.target_node_id ELSE edge.source_node_id END
  FROM public.graph_edges edge
  JOIN public.graph_nodes source_node ON source_node.id = edge.source_node_id
  JOIN public.graph_nodes target_node ON target_node.id = edge.target_node_id
  WHERE (edge.source_node_id = p_node_id OR edge.target_node_id = p_node_id)
    AND (p_edge_kinds IS NULL OR edge.kind = ANY(p_edge_kinds))
    AND public.viewer_has_graph_node_grant(edge.source_node_id, p_viewer_profile_id)
    AND public.viewer_has_graph_node_grant(edge.target_node_id, p_viewer_profile_id)
    AND EXISTS (SELECT 1 FROM public.graph_edge_evidence evidence
      JOIN public.knowledge_events event ON event.id = evidence.evidence_event_id
      JOIN public.knowledge_audiences audience ON audience.id = event.knowledge_audience_id
      JOIN public.graph_node_grants source_grant ON source_grant.node_id = edge.source_node_id
        AND source_grant.knowledge_audience_id = audience.id
      JOIN public.graph_node_grants target_grant ON target_grant.node_id = edge.target_node_id
        AND target_grant.knowledge_audience_id = audience.id
      WHERE evidence.edge_id = edge.id
        AND p_viewer_profile_id = ANY(audience.member_profile_ids)
        AND (source_node.kind IN ('message_event', 'knowledge_unit')
          OR (source_grant.basis_kind = 'edge_evidence' AND source_grant.basis_id = edge.id
            AND source_grant.basis_event_id = evidence.evidence_event_id))
        AND (target_node.kind IN ('message_event', 'knowledge_unit')
          OR (target_grant.basis_kind = 'edge_evidence' AND target_grant.basis_id = edge.id
            AND target_grant.basis_event_id = evidence.evidence_event_id)))
  UNION
  SELECT CASE WHEN edge.source_node_id = p_node_id
    THEN edge.target_node_id ELSE edge.source_node_id END
  FROM public.graph_authority_edges edge
  WHERE (edge.source_node_id = p_node_id OR edge.target_node_id = p_node_id)
    AND (p_edge_kinds IS NULL OR edge.kind = ANY(p_edge_kinds))
    AND public.graph_authority_edge_is_current(edge.id, p_viewer_profile_id)
    AND EXISTS (SELECT 1 FROM public.graph_node_grants source_grant
      JOIN public.graph_node_grants target_grant
        ON target_grant.knowledge_audience_id = source_grant.knowledge_audience_id
      WHERE source_grant.node_id = edge.source_node_id
        AND target_grant.node_id = edge.target_node_id
        AND source_grant.knowledge_audience_id = edge.knowledge_audience_id)
$$;

CREATE FUNCTION public.traverse_knowledge_graph(
  p_root_node_id uuid, p_viewer_profile_id uuid, p_max_depth integer DEFAULT 4,
  p_edge_kinds public.graph_edge_kind[] DEFAULT NULL,
  p_node_budget integer DEFAULT 512, p_frontier_budget integer DEFAULT 128
) RETURNS TABLE (
  node_id uuid, kind public.graph_node_kind, authority_id uuid, label text, depth integer
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_frontier uuid[];
  v_next uuid[];
  v_seen uuid[];
  v_depth integer;
  v_node_budget integer := least(greatest(coalesce(p_node_budget, 512), 1), 4096);
  v_frontier_budget integer := least(greatest(coalesce(p_frontier_budget, 128), 1), 1024);
BEGIN
  SELECT ARRAY[node.id] INTO v_frontier FROM public.graph_nodes node
  WHERE node.id = p_root_node_id
    AND public.viewer_has_graph_node_grant(node.id, p_viewer_profile_id);
  IF v_frontier IS NULL THEN
    RETURN;
  END IF;
  v_seen := v_frontier;
  RETURN QUERY SELECT node.id, node.kind, node.authority_id,
    public.graph_node_label_for_viewer(node.id, p_viewer_profile_id), 0
    FROM public.graph_nodes node WHERE node.id = p_root_node_id;
  FOR v_depth IN 1..least(greatest(coalesce(p_max_depth, 4), 0), 8) LOOP
    SELECT coalesce(array_agg(candidate.node_id ORDER BY candidate.node_id), '{}'::uuid[])
      INTO v_next FROM (
      SELECT DISTINCT neighbor.node_id FROM unnest(v_frontier) frontier(node_id)
      CROSS JOIN LATERAL public.authorized_graph_neighbors(
        frontier.node_id, p_viewer_profile_id, p_edge_kinds) neighbor
      WHERE NOT neighbor.node_id = ANY(v_seen)
      ORDER BY neighbor.node_id LIMIT v_frontier_budget + 1) candidate;
    IF cardinality(v_next) > v_frontier_budget THEN
      RAISE EXCEPTION 'knowledge_graph_frontier_budget_exceeded' USING ERRCODE = '54000';
    END IF;
    IF cardinality(v_seen) + cardinality(v_next) > v_node_budget THEN
      RAISE EXCEPTION 'knowledge_graph_node_budget_exceeded' USING ERRCODE = '54000';
    END IF;
    EXIT WHEN cardinality(v_next) = 0;
    RETURN QUERY SELECT node.id, node.kind, node.authority_id,
      public.graph_node_label_for_viewer(node.id, p_viewer_profile_id), v_depth
      FROM public.graph_nodes node WHERE node.id = ANY(v_next)
      ORDER BY node.kind, node.authority_id;
    v_seen := v_seen || v_next;
    v_frontier := v_next;
  END LOOP;
END
$$;

CREATE FUNCTION public.retrieve_knowledge_graph_claims(
  p_root_kind public.graph_node_kind, p_root_authority_id uuid,
  p_viewer_profile_id uuid, p_graph_enabled boolean DEFAULT true,
  p_max_depth integer DEFAULT 4, p_node_budget integer DEFAULT 512,
  p_frontier_budget integer DEFAULT 128
) RETURNS TABLE (
  knowledge_unit_id uuid, claim text, source_event_id uuid, source_content text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_started_at timestamptz := clock_timestamp();
BEGIN
  IF p_graph_enabled IS NOT TRUE THEN
    PERFORM pg_sleep(greatest(0::double precision,
      0.075 - extract(epoch FROM clock_timestamp() - v_started_at)));
    RETURN;
  END IF;
  RETURN QUERY
  WITH root AS MATERIALIZED (
    SELECT node.id FROM public.graph_nodes node
    WHERE node.kind = p_root_kind AND node.authority_id = p_root_authority_id
      AND public.viewer_has_graph_node_grant(node.id, p_viewer_profile_id)),
  reachable AS MATERIALIZED (
    SELECT traversed.kind, traversed.authority_id
    FROM root CROSS JOIN LATERAL public.traverse_knowledge_graph(
      root.id, p_viewer_profile_id, p_max_depth,
      NULL, p_node_budget, p_frontier_budget) traversed)
  SELECT unit.id, unit.claim, event.id, event.content
  FROM reachable JOIN public.knowledge_units unit
    ON reachable.kind = 'knowledge_unit' AND unit.id = reachable.authority_id
  JOIN public.knowledge_events event ON event.id = unit.source_event_id
  JOIN public.knowledge_audiences audience ON audience.id = event.knowledge_audience_id
  WHERE unit.knowledge_audience_id = event.knowledge_audience_id
    AND audience.purpose = 'source'
    AND p_viewer_profile_id = ANY(audience.member_profile_ids)
  ORDER BY unit.id;
  PERFORM pg_sleep(greatest(0::double precision,
    0.075 - extract(epoch FROM clock_timestamp() - v_started_at)));
END
$$;

REVOKE EXECUTE ON FUNCTION public.traverse_knowledge_graph(
  uuid, uuid, integer, public.graph_edge_kind[], integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.traverse_knowledge_graph(
  uuid, uuid, integer, public.graph_edge_kind[], integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.retrieve_knowledge_graph_claims(
  public.graph_node_kind, uuid, uuid, boolean, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retrieve_knowledge_graph_claims(
  public.graph_node_kind, uuid, uuid, boolean, integer, integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.graph_node_source_audience(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.viewer_has_graph_node_grant(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.graph_authority_edge_is_current(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.viewer_has_current_graph_node(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.graph_node_label_for_viewer(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.authorized_graph_neighbors(
  uuid, uuid, public.graph_edge_kind[]) FROM PUBLIC, anon, authenticated;
