\set ON_ERROR_STOP on
CREATE FUNCTION public.k4b_commit(
  p_key text, p_claim text, p_topics jsonb, p_axis integer, p_room boolean)
RETURNS uuid LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_event uuid; v_attempt uuid; v_token uuid; v_unit uuid; v_candidates jsonb;
  v_embedding vector(1536) := public.k4b_vector(p_axis);
BEGIN
  SELECT event_id INTO STRICT v_event FROM public.claim_source_message_ingress(
    '72000000-0000-4000-8000-000000000001', 'chat', p_key,
    CASE WHEN p_room THEN '72000000-0000-4000-8000-000000000011'::uuid END,
    CASE WHEN p_room THEN 'k3-proof' END, p_claim, 'message', 'conversation', 'user',
    CASE WHEN p_room THEN ARRAY['72000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000002']::uuid[]
      ELSE ARRAY['72000000-0000-4000-8000-000000000001']::uuid[] END,
    CASE WHEN p_room THEN ARRAY['72000000-0000-4000-8000-000000000002']::uuid[]
      ELSE '{}'::uuid[] END, '{"session_id":"72000000-0000-4000-8000-000000000012"}',
    '{"conversation_id":"72000000-0000-4000-8000-000000000012","role":"user"}');
  SELECT attempt_id, lease_token INTO STRICT v_attempt, v_token
  FROM public.begin_knowledge_extraction_attempt(
    '72000000-0000-4000-8000-000000000001', 'openai', 'classification-model',
    'balanced', v_event, 120);
  SELECT coalesce(jsonb_agg(jsonb_build_array(topic_id, representative_unit_id)
    ORDER BY topic_id, representative_unit_id), '[]'::jsonb) INTO v_candidates
  FROM public.resolve_knowledge_topic('cartographer-single-claim-v4',
    (SELECT knowledge_audience_id FROM public.knowledge_events WHERE id = v_event),
    v_embedding, NULL);
  SELECT unit_id INTO STRICT v_unit FROM public.complete_v4_knowledge_extraction_attempt(
    p_attempt_id => v_attempt, p_lease_token => v_token, p_result => 'succeeded',
    p_raw_output => jsonb_build_object('claim',p_claim,'aboutPersonId',NULL,
      'knowledgeType','domain','attentionScore',0.8,'contextSnippet',p_claim,'topics',p_topics),
    p_claim => p_claim, p_knowledge_type => 'domain', p_attention_score => 0.8,
    p_embedding => v_embedding, p_topic_inputs => p_topics,
    p_topic_candidate_snapshot => v_candidates, p_input_tokens => 10, p_output_tokens => 5);
  RETURN v_unit;
END $$;

DO $k4b_backfill$
DECLARE v_job record; v_attempt uuid; v_token uuid; v_result jsonb; v_old record;
  v_embedding vector(1536); v_candidates jsonb; v_topics jsonb; v_topic uuid;
BEGIN
  FOR v_job IN SELECT job.source_event_id, audience.member_profile_ids[1] requester
    FROM public.knowledge_extraction_jobs job JOIN public.knowledge_audiences audience
      ON audience.id = job.knowledge_audience_id
    WHERE job.extractor_version <> 'cartographer-single-claim-v4'
      AND job.state NOT IN ('succeeded','no_claim') LOOP
    SELECT attempt_id, lease_token INTO STRICT v_attempt, v_token
    FROM public.begin_knowledge_extraction_attempt(
      v_job.requester, 'openai', 'drain-model', 'balanced', v_job.source_event_id, 120);
    PERFORM public.complete_knowledge_extraction_attempt(
      p_attempt_id => v_attempt, p_lease_token => v_token, p_result => 'no_claim',
      p_raw_output => '{"claim":null,"aboutPersonId":null,"knowledgeType":"domain",
        "attentionScore":0.1,"contextSnippet":"No durable claim.","topics":[]}',
      p_input_tokens => 3, p_output_tokens => 2);
  END LOOP;
  FOR v_old IN SELECT unit.* FROM public.knowledge_units unit
    LEFT JOIN public.knowledge_topic_identity_outcomes done ON done.unit_id = unit.id
    WHERE unit.extractor_version <> 'cartographer-single-claim-v4' AND done.unit_id IS NULL
    ORDER BY CASE WHEN unit.claim LIKE '%coffee after two%' THEN 0 ELSE 1 END, unit.id LOOP
    v_embedding := coalesce(v_old.embedding, public.k4b_vector(6));
    SELECT coalesce(jsonb_agg(jsonb_build_array(topic_id, representative_unit_id)
      ORDER BY topic_id, representative_unit_id), '[]'::jsonb) INTO v_candidates
    FROM public.resolve_knowledge_topic('cartographer-single-claim-v4',
      v_old.knowledge_audience_id, v_embedding, v_old.id);
    IF v_old.claim LIKE '%coffee after two%' OR v_old.claim LIKE '%afternoon caffeine%' THEN
      v_topic := (v_candidates->0->>0)::uuid;
      IF v_topic IS NULL THEN RAISE EXCEPTION 'k4b_rework_candidate_missing'; END IF;
      v_topics := jsonb_build_array(jsonb_build_object(
        'kind','existing','topicId',v_topic));
    ELSE
      v_topics := jsonb_build_array(jsonb_build_object(
        'kind','new','label','legacy ' || substr(md5(v_old.id::text),1,16)));
    END IF;
    PERFORM public.write_knowledge_topic_identity_backfill(v_old.id,
      jsonb_build_object('claim',v_old.claim,'aboutPersonId',NULL,
        'knowledgeType',coalesce(v_old.knowledge_type,'domain'),
        'attentionScore',coalesce(v_old.attention_score,0.5),
        'contextSnippet',v_old.claim,'topics',v_topics),
      coalesce(v_old.knowledge_type,'domain'), coalesce(v_old.attention_score,0.5),
      v_embedding, v_topics, v_candidates);
  END LOOP;
  v_result := public.assert_knowledge_topic_backfill_complete();
  IF v_result IS DISTINCT FROM
      '{"oldNonTerminalJobs":0,"unitsMissingPhysics":0,"oldUnitsMissingTopicDerivation":0,"orphanTopics":0}' THEN
    RAISE EXCEPTION 'k4b_backfill_zero_assertion_failed:%', v_result; END IF;
  IF (SELECT count(*) FROM public.knowledge_topics WHERE normalized_label IN
      ('coffee consumption','caffeine habits')) <> 1
    OR EXISTS (SELECT 1 FROM public.knowledge_topics WHERE normalized_label = 'coffee consumption')
    THEN RAISE EXCEPTION 'k4b_falsified_topic_residue_remained'; END IF;
END
$k4b_backfill$;

CREATE TEMP TABLE k4b_units(name text PRIMARY KEY, id uuid NOT NULL);
DO $k4b_topics$
DECLARE v_quantum uuid; v_private_only uuid; v_recovery uuid; v_private uuid; v_room uuid;
  v_owner uuid := '72000000-0000-4000-8000-000000000001';
  v_member uuid := '72000000-0000-4000-8000-000000000002';
  v_outsider uuid := '72000000-0000-4000-8000-000000000003';
BEGIN
  INSERT INTO k4b_units VALUES ('quantum-1', public.k4b_commit('k4b-q1',
    'The quantum engines are stable.',
    '[{"kind":"new","label":"quantum engines"}]',1,true));
  SELECT id INTO STRICT v_quantum FROM public.knowledge_topics
    WHERE normalized_label = 'quantum engines';
  INSERT INTO k4b_units VALUES
    ('quantum-2', public.k4b_commit('k4b-q2','The QE work passed its test.',
      jsonb_build_array(jsonb_build_object('kind','existing','topicId',v_quantum)),1,true)),
    ('quantum-3', public.k4b_commit('k4b-q3','Quantum propulsion is ready.',
      jsonb_build_array(jsonb_build_object('kind','existing','topicId',v_quantum)),1,true)),
    ('sourdough', public.k4b_commit('k4b-new','Sourdough fermentation needs warmth.',
      '[{"kind":"new","label":"sourdough fermentation"}]',2,true)),
    ('marathon', public.k4b_commit('k4b-marathon','Marathon training starts Monday.',
      '[{"kind":"new","label":"marathon training"}]',3,true)),
    ('trail', public.k4b_commit('k4b-trail','Trail running needs grippy shoes.',
      '[{"kind":"new","label":"trail running"}]',3,true)),
    ('private-only', public.k4b_commit('k4b-private-only',
      'The private telescope plan starts after midnight.',
      '[{"kind":"new","label":"private telescope"}]',8,false)),
    ('recovery-private', public.k4b_commit('k4b-recovery-private',
      'The private recovery plan uses Friday rest.',
      '[{"kind":"new","label":"recovery planning"}]',5,false)),
    ('recovery-room', public.k4b_commit('k4b-recovery-room',
      'The room recovery plan uses Sunday rest.',
      '[{"kind":"new","label":"recovery planning"}]',5,true));
  IF (SELECT count(*) FROM public.graph_edges
      WHERE target_node_id = public.canonical_graph_node_id('topic',v_quantum) AND kind = 'about') <> 3
    THEN RAISE EXCEPTION 'k4b_three_phrasings_did_not_converge'; END IF;
  IF (SELECT count(*) FROM public.knowledge_topics WHERE normalized_label IN
      ('marathon training','trail running')) <> 2 THEN
    RAISE EXCEPTION 'k4b_adjacent_subjects_false_merged'; END IF;
  SELECT node.id INTO STRICT v_private_only FROM public.graph_nodes node
    JOIN public.knowledge_topics topic ON topic.id = node.authority_id
    WHERE node.kind = 'topic' AND topic.normalized_label = 'private telescope';
  IF public.viewer_has_graph_node_grant(v_private_only,v_outsider)
    OR public.graph_node_label_for_viewer(v_private_only,v_outsider) IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.traverse_knowledge_graph(v_private_only,v_outsider,2))
    OR EXISTS (SELECT 1 FROM public.authorized_graph_neighbors(
      v_private_only,v_outsider,ARRAY['about']::public.graph_edge_kind[]))
    THEN RAISE EXCEPTION 'k4b_private_only_topic_leaked'; END IF;
  SELECT node.id INTO STRICT v_recovery FROM public.graph_nodes node
    JOIN public.knowledge_topics topic ON topic.id = node.authority_id
    WHERE node.kind = 'topic' AND topic.normalized_label = 'recovery planning';
  SELECT id INTO STRICT v_private FROM k4b_units WHERE name = 'recovery-private';
  SELECT id INTO STRICT v_room FROM k4b_units WHERE name = 'recovery-room';
  IF public.graph_node_label_for_viewer(v_recovery,v_outsider) IS NOT NULL
    OR public.viewer_has_graph_node_grant(v_recovery,v_outsider)
    OR EXISTS (SELECT 1 FROM public.traverse_knowledge_graph(v_recovery,v_outsider,2))
    THEN RAISE EXCEPTION 'k4b_private_topic_existence_leaked'; END IF;
  IF public.graph_node_label_for_viewer(v_recovery,v_member) <> 'recovery planning'
    OR (SELECT count(*) FROM public.authorized_graph_neighbors(
      v_recovery,v_member,ARRAY['about']::public.graph_edge_kind[])) <> 1
    OR EXISTS (SELECT 1 FROM public.traverse_knowledge_graph(v_recovery,v_member,1)
      WHERE authority_id = v_private)
    OR NOT EXISTS (SELECT 1 FROM public.traverse_knowledge_graph(v_recovery,v_member,1)
      WHERE authority_id = v_room) THEN RAISE EXCEPTION 'k4b_mixed_topic_member_view_failed'; END IF;
  IF (SELECT count(*) FROM public.authorized_graph_neighbors(
      v_recovery,v_owner,ARRAY['about']::public.graph_edge_kind[])) <> 2 THEN
    RAISE EXCEPTION 'k4b_mixed_topic_owner_view_failed'; END IF;
END
$k4b_topics$;

CREATE FUNCTION public.k4b_prepare_race()
RETURNS TABLE(attempt_id uuid, lease_token uuid, label text, claim text, vector_index integer)
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_event uuid; v_attempt uuid; v_token uuid; v_index integer;
  v_labels text[] := ARRAY['orbital ceramics','spacecraft ceramic shields'];
  v_claims text[] := ARRAY['Orbital ceramics protect the hull.',
    'Ceramic shielding protects spacecraft in orbit.'];
BEGIN
  FOR v_index IN 1..2 LOOP
    SELECT event_id INTO STRICT v_event FROM public.claim_source_message_ingress(
      '72000000-0000-4000-8000-000000000001','chat',format('k4b-race-%s',v_index),
      '72000000-0000-4000-8000-000000000011','k3-proof',v_claims[v_index],
      'message','conversation','user',ARRAY['72000000-0000-4000-8000-000000000001',
        '72000000-0000-4000-8000-000000000002']::uuid[],
      ARRAY['72000000-0000-4000-8000-000000000002']::uuid[],
      '{"session_id":"72000000-0000-4000-8000-000000000012"}',
      '{"conversation_id":"72000000-0000-4000-8000-000000000012","role":"user"}');
    SELECT begun.attempt_id,begun.lease_token INTO STRICT v_attempt,v_token
    FROM public.begin_knowledge_extraction_attempt(
      '72000000-0000-4000-8000-000000000001','openai','race-model',
      'balanced',v_event,120) begun;
    RETURN QUERY SELECT v_attempt,v_token,v_labels[v_index],v_claims[v_index],7;
  END LOOP;
END $$;
CREATE FUNCTION public.k4b_final_assertions() RETURNS text
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_topic uuid;
BEGIN
  SELECT node.id INTO STRICT v_topic FROM public.graph_nodes node
    JOIN public.knowledge_topics topic ON topic.id = node.authority_id
    WHERE node.kind = 'topic' AND topic.normalized_label IN
      ('orbital ceramics','spacecraft ceramic shields');
  IF (SELECT count(*) FROM public.knowledge_topics WHERE normalized_label IN
      ('orbital ceramics','spacecraft ceramic shields')) <> 1
    OR (SELECT count(*) FROM public.graph_edges WHERE target_node_id = v_topic AND kind = 'about') <> 2
    THEN RAISE EXCEPTION 'k4b_concurrent_paraphrase_convergence_failed'; END IF;
  PERFORM public.assert_knowledge_topic_backfill_complete();
  RETURN 'CARTOGRAPHER_K4B_ASSERTIONS_GREEN';
END $$;
