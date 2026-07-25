-- Immutable evidence and the database authorization path for graph discovery.
-- Additive: nothing calls it until the K2 cutover rewires the runtime.
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
    ELSE false END) THEN
    RAISE EXCEPTION 'knowledge_audience_authority_invalid' USING ERRCODE = '23514';
  END IF;
  IF NEW.purpose = 'authority' AND NOT (CASE NEW.scope_kind
    WHEN 'private' THEN NEW.member_profile_ids = ARRAY[NEW.scope_authority_id]::uuid[]
    WHEN 'voyage' THEN NEW.member_profile_ids = coalesce((SELECT
      public.normalize_knowledge_audience_members(array_agg(member.user_id))
      FROM public.voyage_members member WHERE member.voyage_id = NEW.scope_authority_id
        AND member.state = 'active'), '{}'::uuid[])
    WHEN 'space' THEN NEW.member_profile_ids = coalesce((SELECT
      public.normalize_knowledge_audience_members(array_agg(member.user_id))
      FROM public.space_members member WHERE member.space_id = NEW.scope_authority_id
        AND public.is_effective_space_member(member.space_id, member.user_id)), '{}'::uuid[])
    ELSE false END) THEN
    RAISE EXCEPTION 'knowledge_authority_audience_not_exact' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION public.validate_knowledge_unit()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.knowledge_events event
    WHERE event.id = NEW.source_event_id AND event.knowledge_audience_id IS NOT NULL
      AND event.knowledge_audience_id = NEW.knowledge_audience_id) THEN
    RAISE EXCEPTION 'knowledge_unit_source_audience_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION public.validate_graph_node()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT (CASE NEW.kind
    WHEN 'person' THEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.authority_id)
    WHEN 'voyager' THEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.authority_id)
    WHEN 'voyage' THEN EXISTS (SELECT 1 FROM public.voyages v WHERE v.id = NEW.authority_id)
    WHEN 'space' THEN EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = NEW.authority_id)
    WHEN 'message_event' THEN EXISTS (SELECT 1 FROM public.knowledge_events e
      WHERE e.id = NEW.authority_id AND e.knowledge_audience_id IS NOT NULL)
    WHEN 'knowledge_unit' THEN EXISTS (SELECT 1 FROM public.knowledge_units u
      WHERE u.id = NEW.authority_id)
    ELSE false END) THEN
    RAISE EXCEPTION 'graph_node_authority_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION public.guard_graph_node_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.authority_id IS DISTINCT FROM OLD.authority_id THEN
    RAISE EXCEPTION 'graph_node_identity_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION public.graph_node_source_audience(p_node_id uuid)
RETURNS uuid LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT CASE node.kind
    WHEN 'message_event' THEN event.knowledge_audience_id
    WHEN 'knowledge_unit' THEN unit.knowledge_audience_id END
  FROM public.graph_nodes node
  LEFT JOIN public.knowledge_events event
    ON node.kind = 'message_event' AND event.id = node.authority_id
  LEFT JOIN public.knowledge_units unit
    ON node.kind = 'knowledge_unit' AND unit.id = node.authority_id
  WHERE node.id = p_node_id
$$;

CREATE FUNCTION public.validate_graph_node_grant()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_node public.graph_nodes;
  v_audience public.knowledge_audiences;
BEGIN
  SELECT * INTO v_node FROM public.graph_nodes WHERE id = NEW.node_id;
  SELECT * INTO v_audience FROM public.knowledge_audiences WHERE id = NEW.knowledge_audience_id;
  IF v_node.id IS NULL OR NEW.label_snapshot IS DISTINCT FROM v_node.label OR NOT (CASE NEW.basis_kind
    WHEN 'source_event' THEN NEW.basis_event_id IS NULL AND v_audience.purpose = 'source'
      AND EXISTS (SELECT 1 FROM public.knowledge_events event
        WHERE event.id = NEW.basis_id AND event.knowledge_audience_id = NEW.knowledge_audience_id
          AND event.created_at = NEW.granted_at AND NEW.basis_version = 1
          AND ((v_node.kind = 'message_event' AND v_node.authority_id = event.id)
            OR (v_node.kind = 'knowledge_unit' AND EXISTS (SELECT 1 FROM public.knowledge_units unit
              WHERE unit.id = v_node.authority_id AND unit.source_event_id = event.id))))
    WHEN 'edge_evidence' THEN NEW.basis_event_id IS NOT NULL AND v_audience.purpose = 'source'
      AND v_node.kind NOT IN ('message_event', 'knowledge_unit') AND NEW.basis_version = 1
      AND EXISTS (SELECT 1 FROM public.graph_edges edge
        JOIN public.graph_edge_evidence evidence ON evidence.edge_id = edge.id
        JOIN public.knowledge_events event ON event.id = evidence.evidence_event_id
        WHERE edge.id = NEW.basis_id AND evidence.evidence_event_id = NEW.basis_event_id
          AND NEW.node_id IN (edge.source_node_id, edge.target_node_id)
          AND event.knowledge_audience_id = NEW.knowledge_audience_id
          AND event.created_at = NEW.granted_at)
    WHEN 'profile' THEN NEW.basis_event_id IS NULL AND v_audience.purpose = 'authority'
      AND v_audience.scope_kind = 'private' AND v_audience.scope_authority_id = NEW.basis_id
      AND NEW.basis_version = 1 AND EXISTS (SELECT 1 FROM public.profiles profile
        WHERE profile.id = NEW.basis_id AND profile.id = v_node.authority_id
          AND v_node.kind IN ('person', 'voyager') AND profile.created_at = NEW.granted_at)
    WHEN 'voyage_member' THEN NEW.basis_event_id IS NULL AND v_audience.purpose = 'authority'
      AND EXISTS (SELECT 1 FROM public.voyage_members member WHERE member.id = NEW.basis_id
        AND member.revision = NEW.basis_version AND member.state = 'active'
        AND v_audience.scope_kind = 'voyage' AND v_audience.scope_authority_id = member.voyage_id
        AND v_audience.member_profile_ids = coalesce((SELECT
          public.normalize_knowledge_audience_members(array_agg(active.user_id))
          FROM public.voyage_members active WHERE active.voyage_id = member.voyage_id
            AND active.state = 'active'), '{}'::uuid[])
        AND member.state_changed_at = NEW.granted_at AND ((v_node.kind = 'person'
          AND v_node.authority_id = member.user_id) OR (v_node.kind = 'voyage'
          AND v_node.authority_id = member.voyage_id)))
    WHEN 'space_member' THEN NEW.basis_event_id IS NULL AND v_audience.purpose = 'authority'
      AND EXISTS (SELECT 1 FROM public.space_members member WHERE member.id = NEW.basis_id
        AND member.revision = NEW.basis_version
        AND public.is_effective_space_member(member.space_id, member.user_id)
        AND v_audience.scope_kind = 'space' AND v_audience.scope_authority_id = member.space_id
        AND v_audience.member_profile_ids = coalesce((SELECT
          public.normalize_knowledge_audience_members(array_agg(active.user_id))
          FROM public.space_members active WHERE active.space_id = member.space_id
            AND public.is_effective_space_member(active.space_id, active.user_id)), '{}'::uuid[])
        AND member.state_changed_at = NEW.granted_at AND ((v_node.kind = 'person'
          AND v_node.authority_id = member.user_id) OR (v_node.kind = 'space'
          AND v_node.authority_id = member.space_id)))
    WHEN 'space' THEN NEW.basis_event_id IS NULL AND v_audience.purpose = 'authority'
      AND v_audience.scope_kind = 'space' AND v_audience.scope_authority_id = NEW.basis_id
      AND v_audience.member_profile_ids = coalesce((SELECT
        public.normalize_knowledge_audience_members(array_agg(active.user_id))
        FROM public.space_members active WHERE active.space_id = NEW.basis_id
          AND public.is_effective_space_member(active.space_id, active.user_id)), '{}'::uuid[])
      AND NEW.basis_version = 1 AND EXISTS (SELECT 1 FROM public.spaces space
        WHERE space.id = NEW.basis_id AND space.created_at = NEW.granted_at
          AND ((v_node.kind = 'space' AND v_node.authority_id = space.id)
            OR (v_node.kind = 'voyage' AND v_node.authority_id = space.voyage_id)))
    ELSE false END) THEN
    RAISE EXCEPTION 'graph_node_grant_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION public.validate_graph_edge()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_source public.graph_node_kind;
  v_target public.graph_node_kind;
BEGIN
  SELECT kind INTO v_source FROM public.graph_nodes WHERE id = NEW.source_node_id;
  SELECT kind INTO v_target FROM public.graph_nodes WHERE id = NEW.target_node_id;
  IF NOT (CASE NEW.kind
    WHEN 'authored_by' THEN v_source = 'message_event' AND v_target = 'person'
    WHEN 'posted_in' THEN v_source = 'message_event' AND v_target = 'space'
    WHEN 'reply_to' THEN v_source = 'message_event' AND v_target = 'message_event'
    WHEN 'derived_from' THEN v_source = 'knowledge_unit' AND v_target = 'message_event'
    WHEN 'generated_by' THEN v_source IN ('message_event', 'knowledge_unit') AND v_target = 'voyager'
    WHEN 'about' THEN v_source IN ('message_event', 'knowledge_unit') AND v_target <> 'voyager'
    WHEN 'supports' THEN v_source = 'knowledge_unit' AND v_target = 'knowledge_unit'
    WHEN 'contradicts' THEN v_source = 'knowledge_unit' AND v_target = 'knowledge_unit'
    WHEN 'supersedes' THEN v_source = 'knowledge_unit' AND v_target = 'knowledge_unit'
    WHEN 'elaborates' THEN v_source = 'knowledge_unit' AND v_target = 'knowledge_unit'
    WHEN 'relates_to' THEN NEW.source_node_id < NEW.target_node_id
    WHEN 'decided_by' THEN v_source = 'knowledge_unit' AND v_target = 'person'
    WHEN 'raised_by' THEN v_source = 'knowledge_unit' AND v_target = 'person'
    ELSE false END) THEN
    RAISE EXCEPTION 'graph_edge_kind_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE FUNCTION public.validate_graph_edge_evidence()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.graph_edges edge
      JOIN public.graph_nodes source ON source.id = edge.source_node_id
      JOIN public.graph_nodes target ON target.id = edge.target_node_id
      JOIN public.knowledge_events event ON event.id = NEW.evidence_event_id
      JOIN public.knowledge_audiences audience ON audience.id = event.knowledge_audience_id
      WHERE edge.id = NEW.edge_id AND audience.purpose = 'source' AND (
        (source.kind = 'message_event' AND source.authority_id = event.id)
        OR (target.kind = 'message_event' AND target.authority_id = event.id)
        OR (source.kind = 'knowledge_unit' AND EXISTS (SELECT 1 FROM public.knowledge_units unit
          WHERE unit.id = source.authority_id AND unit.source_event_id = event.id))
        OR (target.kind = 'knowledge_unit' AND EXISTS (SELECT 1 FROM public.knowledge_units unit
          WHERE unit.id = target.authority_id AND unit.source_event_id = event.id)))) THEN
    RAISE EXCEPTION 'graph_edge_evidence_invalid' USING ERRCODE = '23514';
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
  FOR EACH ROW EXECUTE FUNCTION public.validate_graph_node();
CREATE TRIGGER trg_graph_node_identity BEFORE UPDATE OR DELETE ON public.graph_nodes
  FOR EACH ROW EXECUTE FUNCTION public.guard_graph_node_identity();
CREATE TRIGGER trg_graph_node_grant_validate BEFORE INSERT ON public.graph_node_grants
  FOR EACH ROW EXECUTE FUNCTION public.validate_graph_node_grant();
CREATE TRIGGER trg_graph_node_grant_immutable BEFORE UPDATE OR DELETE ON public.graph_node_grants
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
CREATE TRIGGER trg_graph_edge_validate BEFORE INSERT ON public.graph_edges
  FOR EACH ROW EXECUTE FUNCTION public.validate_graph_edge();
CREATE TRIGGER trg_graph_edge_immutable BEFORE UPDATE OR DELETE ON public.graph_edges
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
CREATE TRIGGER trg_graph_edge_evidence_validate BEFORE INSERT ON public.graph_edge_evidence
  FOR EACH ROW EXECUTE FUNCTION public.validate_graph_edge_evidence();
CREATE TRIGGER trg_graph_edge_evidence_immutable BEFORE UPDATE OR DELETE ON public.graph_edge_evidence
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
