\set ON_ERROR_STOP on
CREATE FUNCTION public.k4b_vector(p_axis integer) RETURNS vector(1536)
LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, public AS $$
  SELECT array_agg(CASE WHEN position = p_axis THEN 1::real ELSE 0::real END
    ORDER BY position)::vector(1536) FROM generate_series(1, 1536) position
$$;
SELECT public.activate_knowledge_topic_contract();
CREATE FUNCTION public.k4b_v3_commit(
  p_key text, p_claim text, p_label text, p_label_axis integer, p_claim_axis integer)
RETURNS uuid LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_event uuid; v_attempt uuid; v_token uuid; v_unit uuid;
BEGIN
  SELECT event_id INTO STRICT v_event FROM public.claim_source_message_ingress(
    '72000000-0000-4000-8000-000000000001', 'chat', p_key,
    '72000000-0000-4000-8000-000000000011', 'k3-proof', p_claim,
    'message', 'conversation', 'user',
    ARRAY['72000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000002']::uuid[],
    ARRAY['72000000-0000-4000-8000-000000000002']::uuid[],
    '{"session_id":"72000000-0000-4000-8000-000000000012"}',
    '{"conversation_id":"72000000-0000-4000-8000-000000000012","role":"user"}');
  SELECT attempt_id, lease_token INTO STRICT v_attempt, v_token
  FROM public.begin_knowledge_extraction_attempt(
    '72000000-0000-4000-8000-000000000001', 'openai', 'v3-residue-model',
    'balanced', v_event, 120);
  SELECT unit_id INTO STRICT v_unit FROM public.complete_knowledge_extraction_attempt(
    p_attempt_id => v_attempt, p_lease_token => v_token, p_result => 'succeeded',
    p_raw_output => jsonb_build_object('claim',p_claim,'aboutPersonId',NULL,
      'knowledgeType','domain','attentionScore',0.8,'contextSnippet',p_claim,
      'topics',jsonb_build_array(p_label)),
    p_claim => p_claim, p_knowledge_type => 'domain', p_attention_score => 0.8,
    p_embedding => public.k4b_vector(p_claim_axis),
    p_topic_inputs => jsonb_build_array(jsonb_build_object(
      'label',p_label,'embedding',public.k4b_vector(p_label_axis)::text)),
    p_input_tokens => 10, p_output_tokens => 5);
  RETURN v_unit;
END $$;
SELECT public.k4b_v3_commit('k4b-v3-coffee',
  'Isaac stops drinking coffee after two.', 'coffee consumption', 10, 9);
SELECT public.k4b_v3_commit('k4b-v3-caffeine',
  'Isaac cuts out afternoon caffeine.', 'caffeine habits', 11, 9);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.knowledge_topics WHERE normalized_label IN
      ('coffee consumption','caffeine habits')) <> 2 THEN
    RAISE EXCEPTION 'k4b_v3_residue_fixture_did_not_split'; END IF;
END $$;
