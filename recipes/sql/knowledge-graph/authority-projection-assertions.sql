DO $proof$
DECLARE v_voyage uuid := '20000000-0000-4000-8000-000000000001';
  v_space uuid := '30000000-0000-4000-8000-000000000001';
  v_active uuid[] := ARRAY['10000000-0000-4000-8000-000000000003'::uuid];
  v_voyage_members uuid[];
  v_space_members uuid[];
  v_voyage_audience uuid;
  v_space_audience uuid;
BEGIN
  SELECT public.normalize_knowledge_audience_members(array_agg(user_id)) INTO v_voyage_members
    FROM public.voyage_members WHERE voyage_id = v_voyage AND state = 'active';
  SELECT public.normalize_knowledge_audience_members(array_agg(user_id)) INTO v_space_members
    FROM public.space_members WHERE space_id = v_space
      AND public.is_effective_space_member(space_id, user_id);
  v_voyage_audience := public.canonical_knowledge_audience_id(
    'authority', 'voyage', v_voyage, v_voyage_members);
  v_space_audience := public.canonical_knowledge_audience_id(
    'authority', 'space', v_space, v_space_members);
  IF (SELECT count(*) FROM public.voyage_members WHERE user_id IN
      ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')
      AND state = 'left' AND revision = 2) <> 2
    OR NOT EXISTS (SELECT 1 FROM public.voyage_members WHERE user_id = v_active[1]
      AND state = 'active' AND revision = 7)
    OR (SELECT count(*) FROM public.space_members WHERE user_id IN
      ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')
      AND state = 'left' AND revision = 2) <> 2
    OR NOT EXISTS (SELECT 1 FROM public.space_members WHERE user_id = v_active[1]
      AND state = 'active' AND revision = 5)
    OR v_voyage_members IS DISTINCT FROM v_active OR v_space_members IS DISTINCT FROM v_active THEN
    RAISE EXCEPTION 'authority_concurrency_product_truth_failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.knowledge_audiences WHERE id = v_voyage_audience
      AND purpose = 'authority' AND scope_kind = 'voyage' AND scope_authority_id = v_voyage
      AND member_profile_ids = v_voyage_members)
    OR NOT EXISTS (SELECT 1 FROM public.knowledge_audiences WHERE id = v_space_audience
      AND purpose = 'authority' AND scope_kind = 'space' AND scope_authority_id = v_space
      AND member_profile_ids = v_space_members) THEN
    RAISE EXCEPTION 'authority_concurrency_current_audience_failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.voyage_members member LEFT JOIN public.graph_authority_edges edge
      ON edge.authority_kind = 'voyage_member' AND edge.authority_row_id = member.id
      WHERE edge.id IS NULL OR edge.id <> public.canonical_graph_authority_edge_id(
        'voyage_member', member.id, 'member_of')
        OR edge.source_node_id <> public.canonical_graph_node_id('person', member.user_id)
        OR edge.target_node_id <> public.canonical_graph_node_id('voyage', member.voyage_id)
        OR edge.kind <> 'member_of' OR edge.authority_revision IS DISTINCT FROM member.revision
        OR edge.state IS DISTINCT FROM member.state OR edge.effective_at IS DISTINCT FROM member.state_changed_at
        OR edge.knowledge_audience_id <> v_voyage_audience) THEN
    RAISE EXCEPTION 'authority_concurrency_voyage_edge_failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.space_members member LEFT JOIN public.graph_authority_edges edge
      ON edge.authority_kind = 'space_member' AND edge.authority_row_id = member.id
      WHERE edge.id IS NULL OR edge.id <> public.canonical_graph_authority_edge_id(
        'space_member', member.id, 'member_of')
        OR edge.source_node_id <> public.canonical_graph_node_id('person', member.user_id)
        OR edge.target_node_id <> public.canonical_graph_node_id('space', member.space_id)
        OR edge.kind <> 'member_of' OR edge.authority_revision IS DISTINCT FROM member.revision
        OR edge.state IS DISTINCT FROM member.state OR edge.effective_at IS DISTINCT FROM member.state_changed_at
        OR edge.knowledge_audience_id <> v_space_audience) THEN
    RAISE EXCEPTION 'authority_concurrency_space_edge_failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.graph_authority_edges edge JOIN public.spaces space
      ON edge.authority_kind = 'space' AND edge.authority_row_id = space.id
      WHERE space.id = v_space
        AND edge.id = public.canonical_graph_authority_edge_id('space', space.id, 'in_voyage')
        AND edge.source_node_id = public.canonical_graph_node_id('space', space.id)
        AND edge.target_node_id = public.canonical_graph_node_id('voyage', space.voyage_id)
        AND edge.kind = 'in_voyage' AND edge.authority_revision = 1 AND edge.state = 'active'
        AND edge.effective_at = space.created_at AND edge.knowledge_audience_id = v_space_audience)
    OR EXISTS (SELECT 1 FROM public.profiles profile LEFT JOIN public.graph_authority_edges edge
      ON edge.authority_kind = 'profile' AND edge.authority_row_id = profile.id
      LEFT JOIN public.knowledge_audiences audience ON audience.id = edge.knowledge_audience_id
      WHERE edge.id IS NULL OR edge.id <> public.canonical_graph_authority_edge_id(
        'profile', profile.id, 'companion_of')
        OR edge.source_node_id <> public.canonical_graph_node_id('voyager', profile.id)
        OR edge.target_node_id <> public.canonical_graph_node_id('person', profile.id)
        OR edge.kind <> 'companion_of' OR edge.authority_revision <> 1 OR edge.state <> 'active'
        OR edge.effective_at <> profile.created_at OR audience.id <> public.canonical_knowledge_audience_id(
          'authority', 'private', profile.id, ARRAY[profile.id]::uuid[])
        OR audience.member_profile_ids <> ARRAY[profile.id]::uuid[]) THEN
    RAISE EXCEPTION 'authority_concurrency_structural_edge_failed';
  END IF;
  IF (SELECT count(*) FROM public.graph_authority_edges) <> 10
    OR EXISTS (SELECT 1 FROM public.graph_authority_edges GROUP BY authority_kind, authority_row_id, kind HAVING count(*) <> 1)
    OR (SELECT count(DISTINCT knowledge_audience_id) FROM public.graph_authority_edges WHERE authority_kind = 'voyage_member') <> 1
    OR (SELECT count(DISTINCT knowledge_audience_id) FROM public.graph_authority_edges WHERE authority_kind IN ('space', 'space_member')) <> 1 THEN
    RAISE EXCEPTION 'authority_concurrency_duplicate_or_stale_edge';
  END IF;
  IF (SELECT label FROM public.graph_nodes WHERE kind='person' AND authority_id=v_active[1]) <> 'Cato Renamed'
    OR (SELECT label FROM public.graph_nodes WHERE kind='voyage' AND authority_id=v_voyage) <> 'Voyage Renamed' THEN
    RAISE EXCEPTION 'authority_concurrency_source_label_lost';
  END IF;
END
$proof$;
SELECT 'AUTHORITY_PROJECTION_CONCURRENCY_GREEN';
