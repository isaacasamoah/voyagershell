-- Future current projections never refresh profile or voyage labels.
CREATE FUNCTION public.project_voyage_member_graph_authority(p_member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_member public.voyage_members;
  v_person uuid;
  v_voyage uuid;
  v_audience uuid;
BEGIN
  SELECT * INTO STRICT v_member FROM public.voyage_members WHERE id = p_member_id;
  v_person := public.canonical_graph_node_id('person', v_member.user_id);
  v_voyage := public.canonical_graph_node_id('voyage', v_member.voyage_id);
  v_audience := public.ensure_authority_audience('voyage', v_member.voyage_id);
  IF v_member.state = 'active' THEN
    PERFORM public.grant_current_authority_node(v_person, v_audience, 'voyage_member',
      v_member.id, v_member.revision, v_member.state_changed_at);
    PERFORM public.grant_current_authority_node(v_voyage, v_audience, 'voyage_member',
      v_member.id, v_member.revision, v_member.state_changed_at);
  END IF;
  INSERT INTO public.graph_authority_edges(id, source_node_id, target_node_id, kind,
    authority_kind, authority_row_id, authority_revision, state, effective_at, knowledge_audience_id)
  VALUES (public.canonical_graph_authority_edge_id('voyage_member', v_member.id, 'member_of'),
    v_person, v_voyage, 'member_of', 'voyage_member', v_member.id, v_member.revision,
    v_member.state, v_member.state_changed_at, v_audience)
  ON CONFLICT (authority_kind, authority_row_id, kind) DO UPDATE SET
    authority_revision = EXCLUDED.authority_revision, state = EXCLUDED.state,
    effective_at = EXCLUDED.effective_at, knowledge_audience_id = EXCLUDED.knowledge_audience_id,
    projected_at = now();
END
$$;

CREATE FUNCTION public.project_space_graph_authority(p_space_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_space public.spaces;
  v_space_node uuid;
  v_voyage_node uuid;
  v_audience uuid;
BEGIN
  SELECT * INTO STRICT v_space FROM public.spaces WHERE id = p_space_id;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('space:' || p_space_id, 0));
  v_space_node := public.canonical_graph_node_id('space', p_space_id);
  INSERT INTO public.graph_nodes(id, kind, authority_id, label)
  VALUES (v_space_node, 'space', p_space_id, format('space:%s', p_space_id))
  ON CONFLICT (kind, authority_id) DO NOTHING;
  v_audience := public.ensure_authority_audience('space', p_space_id);
  PERFORM public.grant_current_authority_node(v_space_node, v_audience, 'space',
    p_space_id, 1, v_space.created_at);
  IF v_space.voyage_id IS NULL THEN
    RETURN;
  END IF;
  v_voyage_node := public.canonical_graph_node_id('voyage', v_space.voyage_id);
  PERFORM public.grant_current_authority_node(v_voyage_node, v_audience, 'space',
    p_space_id, 1, v_space.created_at);
  INSERT INTO public.graph_authority_edges(id, source_node_id, target_node_id, kind,
    authority_kind, authority_row_id, authority_revision, state, effective_at, knowledge_audience_id)
  VALUES (public.canonical_graph_authority_edge_id('space', p_space_id, 'in_voyage'),
    v_space_node, v_voyage_node, 'in_voyage', 'space', p_space_id, 1, 'active',
    v_space.created_at, v_audience)
  ON CONFLICT (authority_kind, authority_row_id, kind) DO UPDATE SET
    knowledge_audience_id = EXCLUDED.knowledge_audience_id, projected_at = now();
END
$$;

CREATE FUNCTION public.project_space_member_graph_authority(p_member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_member public.space_members;
  v_person uuid;
  v_space uuid;
  v_audience uuid;
BEGIN
  SELECT * INTO STRICT v_member FROM public.space_members WHERE id = p_member_id;
  PERFORM public.project_space_graph_authority(v_member.space_id);
  v_person := public.canonical_graph_node_id('person', v_member.user_id);
  v_space := public.canonical_graph_node_id('space', v_member.space_id);
  v_audience := public.ensure_authority_audience('space', v_member.space_id);
  IF public.is_effective_space_member(v_member.space_id, v_member.user_id) THEN
    PERFORM public.grant_current_authority_node(v_person, v_audience, 'space_member',
      v_member.id, v_member.revision, v_member.state_changed_at);
    PERFORM public.grant_current_authority_node(v_space, v_audience, 'space_member',
      v_member.id, v_member.revision, v_member.state_changed_at);
  END IF;
  INSERT INTO public.graph_authority_edges(id, source_node_id, target_node_id, kind,
    authority_kind, authority_row_id, authority_revision, state, effective_at, knowledge_audience_id)
  VALUES (public.canonical_graph_authority_edge_id('space_member', v_member.id, 'member_of'),
    v_person, v_space, 'member_of', 'space_member', v_member.id, v_member.revision,
    v_member.state, v_member.state_changed_at, v_audience)
  ON CONFLICT (authority_kind, authority_row_id, kind) DO UPDATE SET
    authority_revision = EXCLUDED.authority_revision, state = EXCLUDED.state,
    effective_at = EXCLUDED.effective_at, knowledge_audience_id = EXCLUDED.knowledge_audience_id,
    projected_at = now();
END
$$;

REVOKE EXECUTE ON FUNCTION public.project_voyage_member_graph_authority(uuid),
  public.project_space_graph_authority(uuid), public.project_space_member_graph_authority(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
