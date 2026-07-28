\set ON_ERROR_STOP on
DO $$
DECLARE v_actor uuid := '72000000-0000-4000-8000-000000000001';
  v_source uuid := '76000000-0000-4000-8000-000000000001';
  v_audience uuid; v_attempt uuid; v_token uuid; v_unit uuid; v_result jsonb;
  v_vector vector(1536) := array_fill(0.01::real, ARRAY[1536])::vector;
BEGIN
  SELECT knowledge_audience_id INTO v_audience FROM public.knowledge_events
    WHERE actor_id = v_actor AND actor_type = 'user' LIMIT 1;
  INSERT INTO public.knowledge_events(id, event_type, content, actor_id, actor_type,
    knowledge_audience_id, metadata)
  VALUES (v_source, 'message', 'I prefer quiet progress updates.', v_actor, 'user',
    v_audience, '{}'::jsonb);
  INSERT INTO public.graph_nodes(id, kind, authority_id, label)
  VALUES (public.canonical_graph_node_id('message_event', v_source),
    'message_event', v_source, 'I prefer quiet progress updates.');
  INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind,
    basis_id, basis_version, label_snapshot, granted_at)
  VALUES (public.canonical_graph_node_id('message_event', v_source), v_audience,
    'source_event', v_source, 1, 'I prefer quiet progress updates.',
    (SELECT created_at FROM public.knowledge_events WHERE id = v_source));
  IF (SELECT extractor_version FROM public.knowledge_extraction_jobs
      WHERE source_event_id = v_source) <> 'cartographer-single-claim-v2' THEN
    RAISE EXCEPTION 'active_pointer_did_not_stamp_v2';
  END IF;
  SELECT attempt_id, lease_token INTO v_attempt, v_token
  FROM public.begin_knowledge_extraction_attempt(v_actor, 'openai',
    'classification-model', 'balanced', v_source, 120);
  PERFORM public.complete_knowledge_extraction_attempt(v_attempt, v_token,
    'provider_failed', NULL, NULL, NULL, NULL, NULL, NULL,
    'embedding_provider_error', NULL, NULL);
  IF (SELECT state FROM public.knowledge_extraction_jobs WHERE source_event_id = v_source)
      <> 'pending' OR EXISTS (SELECT 1 FROM public.knowledge_units
        WHERE source_event_id = v_source) THEN
    RAISE EXCEPTION 'embedding_failure_did_not_fail_closed_retryable';
  END IF;
  SELECT attempt_id, lease_token INTO v_attempt, v_token
  FROM public.begin_knowledge_extraction_attempt(v_actor, 'openai',
    'classification-model', 'balanced', v_source, 120);
  SELECT unit_id INTO v_unit FROM public.complete_knowledge_extraction_attempt(
    v_attempt, v_token, 'succeeded',
    '{"claim":"I prefer quiet progress updates.","aboutPersonId":"72000000-0000-4000-8000-000000000001","knowledgeType":"preference","attentionScore":0.8,"contextSnippet":"Prefers quiet progress updates."}',
    'I prefer quiet progress updates.', v_actor, 'preference', 0.8, v_vector,
    NULL, 10, 5);
  IF NOT EXISTS (SELECT 1 FROM public.knowledge_units WHERE id = v_unit
      AND knowledge_type = 'preference' AND attention_score BETWEEN 0.79 AND 0.81
      AND vector_dims(embedding) = 1536) THEN
    RAISE EXCEPTION 'unit_physics_missing';
  END IF;
  v_result := public.retrieve_knowledge_graph_claims_v2(
    v_actor, v_actor, '{}', 4, 512, 128);
  IF NOT v_result->'claims' @> jsonb_build_array(jsonb_build_object(
      'knowledgeUnitId', v_unit, 'knowledgeType', 'preference',
      'sourceEventId', v_source)) THEN
    RAISE EXCEPTION 'graph_read_missing_typed_attributed_claim';
  END IF;
  v_result := public.retrieve_knowledge_graph_claims_v2(
    v_actor, v_actor, ARRAY[v_unit], 4, 512, 128);
  IF jsonb_array_length(v_result->'claims') <> 0 THEN
    RAISE EXCEPTION 'working_memory_exclusion_failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.knowledge_units WHERE id = v_unit
      AND knowledge_type = 'preference' AND attention_score >= 0.5) THEN
    RAISE EXCEPTION 'preference_door_source_missing';
  END IF;
END $$;
SELECT 'CARTOGRAPHER_K4A_ASSERTIONS_GREEN';
