-- Validate graph authority and keep traversal behind PostgreSQL authorization.
CREATE FUNCTION public.intersect_knowledge_audience_members(p_left uuid[], p_right uuid[])
RETURNS uuid[] LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog AS $$
  SELECT coalesce(array_agg(member ORDER BY member), '{}'::uuid[])
  FROM (SELECT unnest(p_left) AS member INTERSECT SELECT unnest(p_right)) common
$$;

CREATE FUNCTION public.reject_immutable_knowledge_graph_row()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION '%_immutable', TG_TABLE_NAME USING ERRCODE = '23514';
END
$$;

CREATE FUNCTION public.guard_knowledge_event_audience()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.knowledge_audience_id IS NOT NULL
    AND NEW.knowledge_audience_id IS DISTINCT FROM OLD.knowledge_audience_id THEN
    RAISE EXCEPTION 'knowledge_event_audience_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION public.validate_knowledge_audience()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(NEW.member_profile_ids) member_id
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = member_id)) THEN
    RAISE EXCEPTION 'knowledge_audience_member_missing' USING ERRCODE = '23514';
  END IF;
  IF NOT (CASE NEW.scope_kind
    WHEN 'private' THEN NEW.member_profile_ids = ARRAY[NEW.scope_authority_id]::uuid[]
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.scope_authority_id)
    WHEN 'voyage' THEN EXISTS (SELECT 1 FROM public.voyages v WHERE v.id = NEW.scope_authority_id)
    WHEN 'space' THEN EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = NEW.scope_authority_id)
    ELSE false
  END) THEN RAISE EXCEPTION 'knowledge_audience_authority_invalid' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION public.validate_knowledge_unit()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_source_audience uuid;
BEGIN
  SELECT event.knowledge_audience_id INTO v_source_audience
  FROM public.knowledge_events event WHERE event.id = NEW.source_event_id;
  IF v_source_audience IS NULL OR NEW.knowledge_audience_id IS DISTINCT FROM v_source_audience THEN
    RAISE EXCEPTION 'knowledge_unit_source_audience_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION public.validate_graph_node_authority()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_scope public.knowledge_audience_scope_kind; v_members uuid[];
BEGIN
  SELECT scope_kind, member_profile_ids INTO v_scope, v_members
  FROM public.knowledge_audiences WHERE id = NEW.knowledge_audience_id;
  IF v_scope IS NULL OR NOT (CASE NEW.kind
    WHEN 'person' THEN NEW.authority_id = ANY(v_members)
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.authority_id)
    WHEN 'voyager' THEN v_scope = 'private' AND v_members = ARRAY[NEW.authority_id]::uuid[]
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.authority_id)
    WHEN 'voyage' THEN v_scope = 'voyage'
      AND EXISTS (SELECT 1 FROM public.voyages v WHERE v.id = NEW.authority_id)
      AND EXISTS (SELECT 1 FROM public.knowledge_audiences a
        WHERE a.id = NEW.knowledge_audience_id AND a.scope_authority_id = NEW.authority_id)
    WHEN 'space' THEN v_scope = 'space'
      AND EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = NEW.authority_id)
      AND EXISTS (SELECT 1 FROM public.knowledge_audiences a
        WHERE a.id = NEW.knowledge_audience_id AND a.scope_authority_id = NEW.authority_id)
    WHEN 'message_event' THEN EXISTS (SELECT 1 FROM public.knowledge_events event
      WHERE event.id = NEW.authority_id AND event.knowledge_audience_id IS NOT NULL
        AND event.knowledge_audience_id = NEW.knowledge_audience_id)
    WHEN 'knowledge_unit' THEN EXISTS (SELECT 1 FROM public.knowledge_units unit
      WHERE unit.id = NEW.authority_id
        AND unit.knowledge_audience_id = NEW.knowledge_audience_id)
    ELSE false
  END) THEN RAISE EXCEPTION 'graph_node_authority_invalid' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION public.guard_graph_node_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.authority_id IS DISTINCT FROM OLD.authority_id
    OR NEW.knowledge_audience_id IS DISTINCT FROM OLD.knowledge_audience_id THEN
    RAISE EXCEPTION 'graph_node_identity_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION public.validate_graph_edge()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  v_source_kind public.graph_node_kind; v_target_kind public.graph_node_kind;
  v_source_audience uuid; v_target_audience uuid; v_expected_audience uuid;
  v_source_scope public.knowledge_audience_scope_kind; v_target_scope public.knowledge_audience_scope_kind;
  v_source_members uuid[]; v_target_members uuid[]; v_edge_members uuid[];
BEGIN
  SELECT n.kind, n.knowledge_audience_id, a.scope_kind, a.member_profile_ids
    INTO v_source_kind, v_source_audience, v_source_scope, v_source_members
  FROM public.graph_nodes n JOIN public.knowledge_audiences a ON a.id = n.knowledge_audience_id
  WHERE n.id = NEW.source_node_id;
  SELECT n.kind, n.knowledge_audience_id, a.scope_kind, a.member_profile_ids
    INTO v_target_kind, v_target_audience, v_target_scope, v_target_members
  FROM public.graph_nodes n JOIN public.knowledge_audiences a ON a.id = n.knowledge_audience_id
  WHERE n.id = NEW.target_node_id;
  SELECT member_profile_ids INTO v_edge_members FROM public.knowledge_audiences
  WHERE id = NEW.knowledge_audience_id;

  IF NOT (CASE NEW.kind
    WHEN 'authored_by' THEN v_source_kind = 'message_event' AND v_target_kind = 'person'
    WHEN 'posted_in' THEN v_source_kind = 'message_event' AND v_target_kind = 'space'
    WHEN 'reply_to' THEN v_source_kind = 'message_event' AND v_target_kind = 'message_event'
    WHEN 'in_voyage' THEN v_source_kind = 'space' AND v_target_kind = 'voyage'
    WHEN 'member_of' THEN v_source_kind = 'person' AND v_target_kind IN ('space', 'voyage')
    WHEN 'companion_of' THEN v_source_kind = 'voyager' AND v_target_kind = 'person'
    WHEN 'derived_from' THEN v_source_kind = 'knowledge_unit' AND v_target_kind = 'message_event'
      AND EXISTS (SELECT 1 FROM public.graph_nodes source_node
        JOIN public.knowledge_units unit ON unit.id = source_node.authority_id
        JOIN public.graph_nodes target_node ON target_node.authority_id = unit.source_event_id
          AND target_node.kind = 'message_event'
        WHERE source_node.id = NEW.source_node_id AND target_node.id = NEW.target_node_id)
    WHEN 'generated_by' THEN v_source_kind IN ('message_event', 'knowledge_unit')
      AND v_target_kind = 'voyager'
    WHEN 'about' THEN v_source_kind IN ('message_event', 'knowledge_unit') AND v_target_kind <> 'voyager'
    WHEN 'supports' THEN v_source_kind = 'knowledge_unit' AND v_target_kind = 'knowledge_unit'
    WHEN 'contradicts' THEN v_source_kind = 'knowledge_unit' AND v_target_kind = 'knowledge_unit'
    WHEN 'supersedes' THEN v_source_kind = 'knowledge_unit' AND v_target_kind = 'knowledge_unit'
    WHEN 'elaborates' THEN v_source_kind = 'knowledge_unit' AND v_target_kind = 'knowledge_unit'
    WHEN 'relates_to' THEN NEW.source_node_id < NEW.target_node_id
    WHEN 'decided_by' THEN v_source_kind = 'knowledge_unit' AND v_target_kind = 'person'
    WHEN 'raised_by' THEN v_source_kind = 'knowledge_unit' AND v_target_kind = 'person'
    ELSE false
  END) THEN RAISE EXCEPTION 'graph_edge_kind_invalid' USING ERRCODE = '23514'; END IF;
  IF v_source_scope = v_target_scope AND v_source_audience <> v_target_audience THEN
    RAISE EXCEPTION 'graph_edge_equal_scope_ambiguous' USING ERRCODE = '23514';
  END IF;
  v_expected_audience := CASE WHEN v_source_scope >= v_target_scope
    THEN v_source_audience ELSE v_target_audience END;
  IF NEW.knowledge_audience_id IS DISTINCT FROM v_expected_audience
    OR v_edge_members IS DISTINCT FROM public.intersect_knowledge_audience_members(
      v_source_members, v_target_members)
    OR cardinality(v_edge_members) = 0 THEN
    RAISE EXCEPTION 'graph_edge_audience_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_knowledge_audience_validate BEFORE INSERT ON public.knowledge_audiences
  FOR EACH ROW EXECUTE FUNCTION public.validate_knowledge_audience();
CREATE TRIGGER trg_knowledge_audience_immutable BEFORE UPDATE OR DELETE ON public.knowledge_audiences
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
CREATE TRIGGER trg_knowledge_event_audience_immutable BEFORE UPDATE OF knowledge_audience_id
  ON public.knowledge_events FOR EACH ROW EXECUTE FUNCTION public.guard_knowledge_event_audience();
CREATE TRIGGER trg_knowledge_unit_validate BEFORE INSERT ON public.knowledge_units
  FOR EACH ROW EXECUTE FUNCTION public.validate_knowledge_unit();
CREATE TRIGGER trg_knowledge_unit_immutable BEFORE UPDATE OR DELETE ON public.knowledge_units
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
CREATE TRIGGER trg_graph_node_validate BEFORE INSERT OR UPDATE ON public.graph_nodes
  FOR EACH ROW EXECUTE FUNCTION public.validate_graph_node_authority();
CREATE TRIGGER trg_graph_node_identity BEFORE UPDATE OR DELETE ON public.graph_nodes
  FOR EACH ROW EXECUTE FUNCTION public.guard_graph_node_identity();
CREATE TRIGGER trg_graph_edge_validate BEFORE INSERT ON public.graph_edges
  FOR EACH ROW EXECUTE FUNCTION public.validate_graph_edge();
CREATE TRIGGER trg_graph_edge_immutable BEFORE UPDATE OR DELETE ON public.graph_edges
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();

CREATE FUNCTION public.traverse_knowledge_graph(
  p_root_node_id uuid, p_viewer_profile_id uuid, p_max_depth integer DEFAULT 4,
  p_edge_kinds public.graph_edge_kind[] DEFAULT NULL
) RETURNS TABLE (
  node_id uuid, kind public.graph_node_kind, authority_id uuid, label text, depth integer
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH RECURSIVE walk(node_id, depth, visited) AS (
    SELECT n.id, 0, ARRAY[n.id] FROM public.graph_nodes n
    JOIN public.knowledge_audiences a ON a.id = n.knowledge_audience_id
    WHERE n.id = p_root_node_id AND p_viewer_profile_id = ANY(a.member_profile_ids)
    UNION ALL
    SELECT adjacent.node_id, walk.depth + 1, walk.visited || adjacent.node_id
    FROM walk JOIN public.graph_edges e
      ON e.source_node_id = walk.node_id OR e.target_node_id = walk.node_id
    JOIN public.graph_nodes source_node ON source_node.id = e.source_node_id
    JOIN public.graph_nodes target_node ON target_node.id = e.target_node_id
    JOIN public.knowledge_audiences source_audience ON source_audience.id = source_node.knowledge_audience_id
    JOIN public.knowledge_audiences target_audience ON target_audience.id = target_node.knowledge_audience_id
    JOIN public.knowledge_audiences edge_audience ON edge_audience.id = e.knowledge_audience_id
    CROSS JOIN LATERAL (SELECT CASE WHEN e.source_node_id = walk.node_id
      THEN e.target_node_id ELSE e.source_node_id END AS node_id) adjacent
    WHERE walk.depth < least(greatest(p_max_depth, 0), 8)
      AND (p_edge_kinds IS NULL OR e.kind = ANY(p_edge_kinds))
      AND p_viewer_profile_id = ANY(source_audience.member_profile_ids)
      AND p_viewer_profile_id = ANY(target_audience.member_profile_ids)
      AND p_viewer_profile_id = ANY(edge_audience.member_profile_ids)
      AND NOT adjacent.node_id = ANY(walk.visited)
  ), ranked AS (
    SELECT walk.*, row_number() OVER (PARTITION BY node_id ORDER BY depth, visited) AS visit_rank
    FROM walk
  )
  SELECT n.id, n.kind, n.authority_id, n.label, ranked.depth
  FROM ranked JOIN public.graph_nodes n ON n.id = ranked.node_id
  JOIN public.knowledge_audiences a ON a.id = n.knowledge_audience_id
  WHERE ranked.visit_rank = 1 AND p_viewer_profile_id = ANY(a.member_profile_ids)
  ORDER BY ranked.depth, n.kind, n.authority_id
$$;

ALTER TABLE public.knowledge_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_edges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.knowledge_audiences, public.knowledge_units,
  public.graph_nodes, public.graph_edges FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.knowledge_audiences, public.knowledge_units,
  public.graph_nodes, public.graph_edges TO service_role;
REVOKE EXECUTE ON FUNCTION public.traverse_knowledge_graph(
  uuid, uuid, integer, public.graph_edge_kind[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.traverse_knowledge_graph(
  uuid, uuid, integer, public.graph_edge_kind[]) TO service_role;
