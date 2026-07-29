\set ON_ERROR_STOP on
DO $$
DECLARE
  v_actor uuid := '72000000-0000-4000-8000-000000000001';
  v_outsider uuid := '72000000-0000-4000-8000-000000000003';
  v_v1_source uuid;
  v_source uuid;
  v_audience uuid;
  v_attempt uuid;
  v_token uuid;
  v_unit uuid;
  v_domain uuid;
  v_result jsonb;
  v_unauthorized jsonb;
  v_outcome text;
  v_empty jsonb := '{"claims":[],"truncated":false}'::jsonb;
  v_vector vector(1536) := array_fill(0.01::real, ARRAY[1536])::vector;
BEGIN
  SELECT event.id, event.knowledge_audience_id
    INTO STRICT v_v1_source, v_audience
  FROM public.knowledge_events event
  JOIN public.knowledge_extraction_jobs job ON job.source_event_id = event.id
  WHERE job.extractor_version = 'cartographer-single-claim-v1'
    AND event.content = 'K3 private eligibility';

  SELECT attempt_id, lease_token INTO STRICT v_attempt, v_token
  FROM public.begin_knowledge_extraction_attempt(
    v_actor, 'anthropic', 'v1-model', 'balanced', v_v1_source, 120);
  SELECT unit_id INTO STRICT v_unit
  FROM public.complete_knowledge_extraction_attempt(
    v_attempt, v_token, 'succeeded',
    '{"claim":"Pinned v1 completes after v2 activation.","aboutPersonId":null,"knowledgeType":"domain","attentionScore":0.6,"contextSnippet":"Pinned v1."}',
    'Pinned v1 completes after v2 activation.', NULL, NULL, NULL, NULL,
    NULL, 10, 5);
  IF NOT EXISTS (
      SELECT 1 FROM public.knowledge_units
      WHERE id = v_unit AND extractor_version = 'cartographer-single-claim-v1'
        AND knowledge_type IS NULL AND attention_score IS NULL AND embedding IS NULL
    ) THEN
    RAISE EXCEPTION 'pinned_v1_execution_demanded_v2_physics';
  END IF;

  v_source := '76000000-0000-4000-8000-000000000001';
  INSERT INTO public.knowledge_events(
    id, event_type, content, actor_id, actor_type, knowledge_audience_id, metadata)
  VALUES (
    v_source, 'message', 'Quantum engines use constrained plasma.', v_actor,
    'user', v_audience, '{}'::jsonb);
  INSERT INTO public.graph_nodes(id, kind, authority_id, label)
  VALUES (
    public.canonical_graph_node_id('message_event', v_source),
    'message_event', v_source, 'Quantum engines use constrained plasma.');
  INSERT INTO public.graph_node_grants(
    node_id, knowledge_audience_id, basis_kind, basis_id, basis_version,
    label_snapshot, granted_at)
  VALUES (
    public.canonical_graph_node_id('message_event', v_source), v_audience,
    'source_event', v_source, 1, 'Quantum engines use constrained plasma.',
    (SELECT created_at FROM public.knowledge_events WHERE id = v_source));
  IF (SELECT extractor_version FROM public.knowledge_extraction_jobs
      WHERE source_event_id = v_source) <> 'cartographer-single-claim-v2' THEN
    RAISE EXCEPTION 'active_pointer_did_not_stamp_v2';
  END IF;
  SELECT attempt_id, lease_token INTO STRICT v_attempt, v_token
  FROM public.begin_knowledge_extraction_attempt(
    v_actor, 'openai', 'classification-model', 'balanced', v_source, 120);
  SELECT outcome::text INTO STRICT v_outcome
  FROM public.complete_knowledge_extraction_attempt(
    v_attempt, v_token, 'succeeded',
    '{"claim":"Quantum engines use constrained plasma.","aboutPersonId":null,"knowledgeType":"domain","attentionScore":0.82,"contextSnippet":"Quantum engines."}',
    'Quantum engines use constrained plasma.', NULL, NULL, NULL, NULL,
    NULL, 10, 5);
  IF v_outcome <> 'commit_rejected' THEN
    RAISE EXCEPTION 'v2_missing_physics_was_not_demanded';
  END IF;
  SELECT attempt_id, lease_token INTO STRICT v_attempt, v_token
  FROM public.begin_knowledge_extraction_attempt(
    v_actor, 'openai', 'classification-model', 'balanced', v_source, 120);
  SELECT unit_id INTO STRICT v_domain
  FROM public.complete_knowledge_extraction_attempt(
    v_attempt, v_token, 'succeeded',
    '{"claim":"Quantum engines use constrained plasma.","aboutPersonId":"72000000-0000-4000-8000-000000000001","knowledgeType":"domain","attentionScore":0.82,"contextSnippet":"Quantum engines."}',
    'Quantum engines use constrained plasma.', v_actor, 'domain', 0.82,
    v_vector, NULL, 10, 5);
  IF NOT EXISTS (
      SELECT 1 FROM public.knowledge_units
      WHERE id = v_domain AND knowledge_type = 'domain'
        AND attention_score BETWEEN 0.819 AND 0.821
        AND vector_dims(embedding) = 1536
    ) THEN
    RAISE EXCEPTION 'domain_unit_physics_missing';
  END IF;

  v_source := '76000000-0000-4000-8000-000000000002';
  INSERT INTO public.knowledge_events(
    id, event_type, content, actor_id, actor_type, knowledge_audience_id, metadata)
  VALUES (
    v_source, 'message', 'Stop drinking coffee after 2pm.', v_actor,
    'user', v_audience, '{}'::jsonb);
  INSERT INTO public.graph_nodes(id, kind, authority_id, label)
  VALUES (
    public.canonical_graph_node_id('message_event', v_source),
    'message_event', v_source, 'Stop drinking coffee after 2pm.');
  INSERT INTO public.graph_node_grants(
    node_id, knowledge_audience_id, basis_kind, basis_id, basis_version,
    label_snapshot, granted_at)
  VALUES (
    public.canonical_graph_node_id('message_event', v_source), v_audience,
    'source_event', v_source, 1, 'Stop drinking coffee after 2pm.',
    (SELECT created_at FROM public.knowledge_events WHERE id = v_source));
  SELECT attempt_id, lease_token INTO STRICT v_attempt, v_token
  FROM public.begin_knowledge_extraction_attempt(
    v_actor, 'openai', 'classification-model', 'balanced', v_source, 120);
  SELECT unit_id INTO STRICT v_unit
  FROM public.complete_knowledge_extraction_attempt(
    v_attempt, v_token, 'succeeded',
    '{"claim":"Stop drinking coffee after 2pm.","aboutPersonId":"72000000-0000-4000-8000-000000000001","knowledgeType":"preference","attentionScore":0.8,"contextSnippet":"Coffee cutoff."}',
    'Stop drinking coffee after 2pm.', v_actor, 'preference', 0.8,
    v_vector, NULL, 10, 5);
  IF NOT EXISTS (
      SELECT 1 FROM public.knowledge_units
      WHERE id = v_unit AND knowledge_type = 'preference'
        AND vector_dims(embedding) = 1536
    ) THEN
    RAISE EXCEPTION 'preference_unit_physics_missing';
  END IF;

  DELETE FROM public.knowledge_current WHERE event_id = v_source;
  DELETE FROM public.knowledge_current
    WHERE event_id = (SELECT source_event_id FROM public.knowledge_units WHERE id = v_domain);
  v_result := public.retrieve_knowledge_graph_claims_v2(
    v_actor, v_actor, '{}', 4, 512, 128);
  IF NOT v_result->'claims' @> jsonb_build_array(
      jsonb_build_object('knowledgeUnitId', v_domain, 'knowledgeType', 'domain'),
      jsonb_build_object('knowledgeUnitId', v_unit, 'knowledgeType', 'preference')
    ) THEN
    RAISE EXCEPTION 'projection_independent_graph_read_failed';
  END IF;
  v_unauthorized := public.retrieve_knowledge_graph_claims_v2(
    v_actor, v_outsider, '{}', 4, 512, 128);
  IF convert_to(v_unauthorized::text, 'UTF8') <>
      convert_to(v_empty::text, 'UTF8') THEN
    RAISE EXCEPTION 'unauthorized_graph_read_not_ordinary_empty';
  END IF;
  IF jsonb_array_length(public.retrieve_knowledge_graph_claims_v2(
      v_actor, v_actor, ARRAY[v_unit], 4, 512, 128)->'claims') >=
      jsonb_array_length(v_result->'claims') THEN
    RAISE EXCEPTION 'working_memory_exclusion_failed';
  END IF;
END $$;

-- Create separate chain and fan-out components using the same private audience.
DO $$
DECLARE
  v_actor uuid := '72000000-0000-4000-8000-000000000001';
  v_audience uuid;
  v_root uuid;
  v_previous uuid;
  v_event uuid;
  v_unit uuid;
  v_node uuid;
  v_edge uuid;
  v_edge_source uuid;
  v_edge_target uuid;
  i integer;
BEGIN
  SELECT id INTO STRICT v_audience FROM public.knowledge_audiences
  WHERE member_profile_ids = ARRAY[v_actor]::uuid[] AND purpose = 'source'
  ORDER BY created_at LIMIT 1;
  SELECT id INTO STRICT v_root FROM public.graph_nodes
  WHERE kind = 'person' AND authority_id = v_actor;
  FOR i IN 1..12 LOOP
    v_event := md5(format('k4a-overflow-event-%s', i))::uuid;
    v_unit := md5(format('k4a-overflow-unit-%s', i))::uuid;
    v_node := public.canonical_graph_node_id('knowledge_unit', v_unit);
    INSERT INTO public.knowledge_events(
      id, event_type, content, actor_id, actor_type, knowledge_audience_id, metadata)
    VALUES (v_event, 'message', format('Overflow useful claim %s', i), v_actor,
      'user', v_audience, '{}'::jsonb);
    INSERT INTO public.graph_nodes(id, kind, authority_id, label)
    VALUES (public.canonical_graph_node_id('message_event', v_event),
      'message_event', v_event, format('Overflow useful claim %s', i));
    INSERT INTO public.graph_node_grants(
      node_id, knowledge_audience_id, basis_kind, basis_id, basis_version,
      label_snapshot, granted_at)
    VALUES (public.canonical_graph_node_id('message_event', v_event), v_audience,
      'source_event', v_event, 1, format('Overflow useful claim %s', i),
      (SELECT created_at FROM public.knowledge_events WHERE id = v_event));
    INSERT INTO public.knowledge_units(
      id, claim, source_event_id, extractor_version, claim_key,
      knowledge_audience_id, knowledge_type, attention_score, embedding)
    VALUES (v_unit, format('Overflow useful claim %s', i), v_event,
      'cartographer-single-claim-v2', 'claim:0', v_audience, 'domain', 0.7,
      array_fill(0.02::real, ARRAY[1536])::vector);
    INSERT INTO public.graph_nodes(id, kind, authority_id, label)
    VALUES (v_node, 'knowledge_unit', v_unit, format('Overflow useful claim %s', i));
    INSERT INTO public.graph_node_grants(
      node_id, knowledge_audience_id, basis_kind, basis_id, basis_version,
      label_snapshot, granted_at)
    VALUES (v_node, v_audience, 'source_event', v_event, 1,
      format('Overflow useful claim %s', i),
      (SELECT created_at FROM public.knowledge_events WHERE id = v_event));
    IF i <= 6 THEN
      v_edge_source := v_node;
      v_edge_target := v_root;
      v_edge := public.canonical_graph_edge_id(
        v_edge_source, 'about', v_edge_target);
    ELSE
      v_edge_source := least(v_node, v_previous);
      v_edge_target := greatest(v_node, v_previous);
      v_edge := public.canonical_graph_edge_id(
        v_edge_source, 'relates_to', v_edge_target);
    END IF;
    INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)
    VALUES (v_edge, v_edge_source, v_edge_target,
      (CASE WHEN i <= 6 THEN 'about' ELSE 'relates_to' END)::public.graph_edge_kind);
    INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)
    VALUES (v_edge, v_event);
    v_previous := v_node;
  END LOOP;
END $$;

SELECT 'CARTOGRAPHER_K4A_ASSERTIONS_GREEN';
