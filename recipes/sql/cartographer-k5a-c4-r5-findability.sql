-- G8 strengthening: every search shape reaches birth-zero and retired units.
CREATE OR REPLACE FUNCTION public.k5a_c4_assert_findable(
  p_viewer_profile_id uuid,
  p_unit_id uuid,
  p_query_embedding vector(1536),
  p_keyword text,
  p_expected_retired boolean
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
  v_created_at timestamptz;
  v_hit jsonb;
BEGIN
  SELECT event.created_at INTO STRICT v_created_at
  FROM public.knowledge_units unit
  JOIN public.knowledge_events event ON event.id = unit.source_event_id
  WHERE unit.id = p_unit_id;

  SELECT to_jsonb(hit) INTO v_hit FROM public.search_knowledge_units(
    p_viewer_profile_id, p_query_embedding, 0.99, 50,
    NULL, NULL, NULL, NULL
  ) hit WHERE hit.unit_id = p_unit_id;
  IF v_hit IS NULL OR (v_hit->>'viewer_retired')::boolean
      IS DISTINCT FROM p_expected_retired
    OR (v_hit->>'effective_attention')::real IS DISTINCT FROM 0::real THEN
    RAISE EXCEPTION 'k5a_c4_g8_semantic_miss:%:%', p_unit_id, v_hit;
  END IF;

  v_hit := NULL;
  SELECT to_jsonb(hit) INTO v_hit FROM public.keyword_search_units(
    p_viewer_profile_id, p_keyword, 50, NULL
  ) hit WHERE hit.unit_id = p_unit_id;
  IF v_hit IS NULL THEN
    RAISE EXCEPTION 'k5a_c4_g8_keyword_miss:%', p_unit_id;
  END IF;

  v_hit := NULL;
  SELECT to_jsonb(hit) INTO v_hit FROM public.keyword_search_units(
    p_viewer_profile_id, p_keyword, 50, p_viewer_profile_id
  ) hit WHERE hit.unit_id = p_unit_id;
  IF v_hit IS NULL THEN
    RAISE EXCEPTION 'k5a_c4_g8_anchored_miss:%', p_unit_id;
  END IF;

  v_hit := NULL;
  SELECT to_jsonb(hit) INTO v_hit FROM public.search_knowledge_units(
    p_viewer_profile_id, NULL, 0.6, 50,
    NULL, v_created_at, v_created_at, NULL
  ) hit WHERE hit.unit_id = p_unit_id;
  IF v_hit IS NULL THEN
    RAISE EXCEPTION 'k5a_c4_g8_temporal_miss:%', p_unit_id;
  END IF;

  v_hit := NULL;
  SELECT to_jsonb(hit) INTO v_hit FROM public.search_knowledge_units(
    p_viewer_profile_id, NULL, 0.6, 50,
    NULL, NULL, NULL, ARRAY[p_unit_id]
  ) hit WHERE hit.unit_id = p_unit_id;
  IF v_hit IS NULL THEN
    RAISE EXCEPTION 'k5a_c4_g8_exact_id_miss:%', p_unit_id;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.k5a_c4_assert_g8_findability(
  p_viewer_profile_id uuid,
  p_unauthorized_profile_id uuid
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
  v_zero_query vector(1536) :=
    (array_fill(0::real, ARRAY[1533]) || ARRAY[1::real, 0::real, 0::real])::vector;
  v_retired_query vector(1536) :=
    (array_fill(0::real, ARRAY[1532]) || ARRAY[1::real, 0::real, 0::real, 0::real])::vector;
  v_zero_unit uuid := md5(format(
    'k5a-c4-r5-unit:%s:%s:%s', p_viewer_profile_id, 'birthzero-findable', 1
  ))::uuid;
  v_retired_unit uuid := md5(format(
    'k5a-c4-r5-unit:%s:%s:%s', p_viewer_profile_id, 'retired-findable', 1
  ))::uuid;
  v_person_node public.graph_nodes;
  v_unit record;
  v_edge uuid;
  v_leaked integer;
BEGIN
  PERFORM public.k5a_c4_seed_private_units(
    p_viewer_profile_id, 'birthzero-findable', 1, v_zero_query, 0
  );
  PERFORM public.k5a_c4_seed_private_units(
    p_viewer_profile_id, 'retired-findable', 1, v_retired_query, 0.7
  );
  SELECT node.* INTO STRICT v_person_node FROM public.graph_nodes node
  WHERE node.kind = 'person' AND node.authority_id = p_viewer_profile_id;
  FOR v_unit IN SELECT unit.id, unit.source_event_id, unit.knowledge_audience_id,
      unit.claim, event.created_at
    FROM public.knowledge_units unit JOIN public.knowledge_events event
      ON event.id = unit.source_event_id
    WHERE unit.id IN (v_zero_unit, v_retired_unit) LOOP
    v_edge := public.canonical_graph_edge_id(
      public.canonical_graph_node_id('knowledge_unit', v_unit.id),
      'about', v_person_node.id
    );
    INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)
    VALUES (v_edge, public.canonical_graph_node_id('knowledge_unit', v_unit.id),
      v_person_node.id, 'about') ON CONFLICT DO NOTHING;
    INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)
    VALUES (v_edge, v_unit.source_event_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.graph_node_grants(
      node_id, knowledge_audience_id, basis_kind, basis_id, basis_version,
      label_snapshot, granted_at, basis_event_id
    ) VALUES (
      v_person_node.id, v_unit.knowledge_audience_id, 'edge_evidence', v_edge,
      1, v_person_node.label, v_unit.created_at, v_unit.source_event_id
    ) ON CONFLICT DO NOTHING;
  END LOOP;
  INSERT INTO public.knowledge_unit_citations(
    knowledge_unit_id, person_id, act_kind, actor_kind, actor_profile_id,
    basis_kind, basis_id, basis_version
  ) VALUES (
    v_retired_unit, p_viewer_profile_id, 'retired', 'system', NULL,
    'legacy-supersession-v0', v_retired_unit::text, 1
  ) ON CONFLICT DO NOTHING;

  PERFORM public.k5a_c4_assert_findable(
    p_viewer_profile_id, v_zero_unit, v_zero_query, 'birthzero findable', false
  );
  PERFORM public.k5a_c4_assert_findable(
    p_viewer_profile_id, v_retired_unit, v_retired_query,
    'retired findable', true
  );

  SELECT count(*) INTO v_leaked FROM public.search_knowledge_units(
    p_unauthorized_profile_id, v_zero_query, 0.99, 50,
    NULL, NULL, NULL, NULL
  ) hit WHERE hit.unit_id IN (v_zero_unit, v_retired_unit);
  IF v_leaked <> 0 THEN
    RAISE EXCEPTION 'k5a_c4_g8_semantic_authorization_leak:%', v_leaked;
  END IF;
  SELECT count(*) INTO v_leaked FROM public.keyword_search_units(
    p_unauthorized_profile_id, 'findable', 50, NULL
  ) hit WHERE hit.unit_id IN (v_zero_unit, v_retired_unit);
  IF v_leaked <> 0 THEN
    RAISE EXCEPTION 'k5a_c4_g8_keyword_authorization_leak:%', v_leaked;
  END IF;
END
$$;
