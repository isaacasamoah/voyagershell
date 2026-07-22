-- K0 application-facing read boundary. The function exposes exact claim/source
-- pairs only; traversal paths, counts, audience, edge and timing metadata stay private.
CREATE FUNCTION public.guard_knowledge_event_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'knowledge_audience_id')
    IS DISTINCT FROM (to_jsonb(OLD) - 'knowledge_audience_id') THEN
    RAISE EXCEPTION 'knowledge_event_source_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_knowledge_event_source_immutable
  BEFORE UPDATE OR DELETE ON public.knowledge_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_knowledge_event_source();

CREATE FUNCTION public.retrieve_knowledge_graph_claims(
  p_root_kind public.graph_node_kind,
  p_root_authority_id uuid,
  p_viewer_profile_id uuid,
  p_graph_enabled boolean DEFAULT true,
  p_max_depth integer DEFAULT 4
) RETURNS TABLE (
  knowledge_unit_id uuid,
  claim text,
  source_event_id uuid,
  source_content text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_started_at timestamptz := clock_timestamp();
BEGIN
  RETURN QUERY
  WITH authorized_root AS MATERIALIZED (
    SELECT node.id
    FROM public.graph_nodes node
    JOIN public.knowledge_audiences audience ON audience.id = node.knowledge_audience_id
    WHERE node.kind = p_root_kind
      AND node.authority_id = p_root_authority_id
      AND p_graph_enabled IS TRUE
      AND p_viewer_profile_id = ANY(audience.member_profile_ids)
  ), reachable AS MATERIALIZED (
    SELECT traversed.kind, traversed.authority_id
    FROM authorized_root root
    CROSS JOIN LATERAL public.traverse_knowledge_graph(
      root.id,
      p_viewer_profile_id,
      CASE WHEN p_graph_enabled THEN p_max_depth ELSE 0 END,
      CASE WHEN p_graph_enabled THEN NULL::public.graph_edge_kind[]
        ELSE ARRAY[]::public.graph_edge_kind[] END
    ) traversed
  )
  SELECT unit.id, unit.claim, event.id, event.content
  FROM reachable
  JOIN public.knowledge_units unit
    ON reachable.kind = 'knowledge_unit' AND unit.id = reachable.authority_id
  JOIN public.knowledge_events event ON event.id = unit.source_event_id
  JOIN public.knowledge_audiences unit_audience ON unit_audience.id = unit.knowledge_audience_id
  JOIN public.knowledge_audiences event_audience ON event_audience.id = event.knowledge_audience_id
  WHERE p_viewer_profile_id = ANY(unit_audience.member_profile_ids)
    AND p_viewer_profile_id = ANY(event_audience.member_profile_ids)
    AND unit.knowledge_audience_id = event.knowledge_audience_id
  ORDER BY unit.id;

  -- A common response floor makes inaccessible-existing and absent roots share
  -- the same observable timing class for the bounded K0 harness.
  PERFORM pg_sleep(greatest(0::double precision,
    0.075 - extract(epoch FROM clock_timestamp() - v_started_at)));
END
$$;

REVOKE EXECUTE ON FUNCTION public.retrieve_knowledge_graph_claims(
  public.graph_node_kind, uuid, uuid, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retrieve_knowledge_graph_claims(
  public.graph_node_kind, uuid, uuid, boolean, integer) TO service_role;
