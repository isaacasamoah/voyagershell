-- Projection primitives only. 063 installs triggers under locks and catches up every row.
CREATE FUNCTION public.ensure_authority_audience(
  p_scope public.knowledge_audience_scope_kind, p_authority_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_members uuid[];
  v_id uuid;
BEGIN
  v_members := CASE p_scope
    WHEN 'private' THEN ARRAY[p_authority_id]::uuid[]
    WHEN 'voyage' THEN coalesce((SELECT public.normalize_knowledge_audience_members(array_agg(user_id))
      FROM public.voyage_members WHERE voyage_id = p_authority_id AND state = 'active'), '{}'::uuid[])
    WHEN 'space' THEN coalesce((SELECT public.normalize_knowledge_audience_members(array_agg(user_id))
      FROM public.space_members WHERE space_id = p_authority_id
        AND public.is_effective_space_member(space_id, user_id)), '{}'::uuid[])
  END;
  v_id := public.canonical_knowledge_audience_id('authority', p_scope, p_authority_id, v_members);
  INSERT INTO public.knowledge_audiences(id, purpose, scope_kind, scope_authority_id, member_profile_ids)
  VALUES (v_id, 'authority', p_scope, p_authority_id, v_members) ON CONFLICT DO NOTHING;
  RETURN v_id;
END
$$;

CREATE FUNCTION public.grant_current_authority_node(
  p_node_id uuid, p_audience_id uuid, p_basis_kind text, p_basis_id uuid,
  p_basis_version bigint, p_granted_at timestamptz
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind,
    basis_id, basis_version, label_snapshot, granted_at)
  SELECT node.id, p_audience_id, p_basis_kind, p_basis_id, p_basis_version,
    node.label, p_granted_at FROM public.graph_nodes node WHERE node.id = p_node_id
  ON CONFLICT DO NOTHING
$$;

CREATE FUNCTION public.project_profile_graph_authority(p_profile_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_profile public.profiles;
  v_person uuid;
  v_voyager uuid;
  v_audience uuid;
BEGIN
  SELECT * INTO STRICT v_profile FROM public.profiles WHERE id = p_profile_id;
  v_person := public.canonical_graph_node_id('person', p_profile_id);
  v_voyager := public.canonical_graph_node_id('voyager', p_profile_id);
  INSERT INTO public.graph_nodes(id, kind, authority_id, label) VALUES
    (v_person, 'person', p_profile_id, coalesce(nullif(v_profile.display_name, ''),
      nullif(v_profile.username, ''), format('person:%s', p_profile_id))),
    (v_voyager, 'voyager', p_profile_id, coalesce(nullif(v_profile.username, ''),
      nullif(v_profile.display_name, ''), format('voyager:%s', p_profile_id)))
  ON CONFLICT (kind, authority_id) DO UPDATE SET label = EXCLUDED.label;
  v_audience := public.ensure_authority_audience('private', p_profile_id);
  PERFORM public.grant_current_authority_node(v_person, v_audience, 'profile',
    p_profile_id, 1, v_profile.created_at);
  PERFORM public.grant_current_authority_node(v_voyager, v_audience, 'profile',
    p_profile_id, 1, v_profile.created_at);
  INSERT INTO public.graph_authority_edges(id, source_node_id, target_node_id, kind,
    authority_kind, authority_row_id, authority_revision, state, effective_at,
    knowledge_audience_id)
  VALUES (public.canonical_graph_authority_edge_id('profile', p_profile_id, 'companion_of'),
    v_voyager, v_person, 'companion_of', 'profile', p_profile_id, 1, 'active',
    v_profile.created_at, v_audience)
  ON CONFLICT (authority_kind, authority_row_id, kind) DO UPDATE SET
    source_node_id = EXCLUDED.source_node_id, target_node_id = EXCLUDED.target_node_id,
    authority_revision = 1, state = 'active', effective_at = EXCLUDED.effective_at,
    knowledge_audience_id = EXCLUDED.knowledge_audience_id, projected_at = now();
END
$$;

CREATE FUNCTION public.project_voyage_graph_authority(p_voyage_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO public.graph_nodes(id, kind, authority_id, label)
  SELECT public.canonical_graph_node_id('voyage', id), 'voyage', id, name
  FROM public.voyages WHERE id = p_voyage_id
  ON CONFLICT (kind, authority_id) DO UPDATE SET label = EXCLUDED.label
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_authority_audience(
  public.knowledge_audience_scope_kind, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.grant_current_authority_node(
  uuid, uuid, text, uuid, bigint, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.project_profile_graph_authority(uuid),
  public.project_voyage_graph_authority(uuid) FROM PUBLIC, anon, authenticated, service_role;
