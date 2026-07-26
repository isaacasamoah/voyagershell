DO $k3_setup$
DECLARE
  v_private uuid;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data, created_at) VALUES
    ('72000000-0000-4000-8000-000000000001', 'k3-owner@example.invalid',
      '{"display_name":"K3 owner"}', clock_timestamp()),
    ('72000000-0000-4000-8000-000000000002', 'k3-person@example.invalid',
      '{"display_name":"K3 person"}', clock_timestamp()),
    ('72000000-0000-4000-8000-000000000003', 'k3-outsider@example.invalid',
      '{"display_name":"K3 outsider"}', clock_timestamp());
  INSERT INTO public.voyages(id, slug, name) VALUES
    ('72000000-0000-4000-8000-000000000010', 'k3-proof', 'K3 proof');
  INSERT INTO public.voyage_members(id, voyage_id, user_id, role) VALUES
    ('72000000-0000-4000-8000-000000000020',
      '72000000-0000-4000-8000-000000000010',
      '72000000-0000-4000-8000-000000000001', 'captain'),
    ('72000000-0000-4000-8000-000000000021',
      '72000000-0000-4000-8000-000000000010',
      '72000000-0000-4000-8000-000000000002', 'crew');
  INSERT INTO public.spaces(id, voyage_id, created_by) VALUES
    ('72000000-0000-4000-8000-000000000011',
      '72000000-0000-4000-8000-000000000010',
      '72000000-0000-4000-8000-000000000001');
  INSERT INTO public.space_members(space_id, user_id, state) VALUES
    ('72000000-0000-4000-8000-000000000011',
      '72000000-0000-4000-8000-000000000001', 'active'),
    ('72000000-0000-4000-8000-000000000011',
      '72000000-0000-4000-8000-000000000002', 'active');
  INSERT INTO public.sessions(id, user_id, voyage_id, space_id, status) VALUES
    ('72000000-0000-4000-8000-000000000012',
      '72000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000010',
      '72000000-0000-4000-8000-000000000011', 'active');

  SELECT event_id INTO STRICT v_private FROM public.claim_source_message_ingress(
    '72000000-0000-4000-8000-000000000001', 'chat', 'k3-private', NULL, NULL,
    'K3 private eligibility', 'conversation', 'conversation', 'user',
    ARRAY['72000000-0000-4000-8000-000000000001']::uuid[], '{}'::uuid[],
    '{"session_id":"72000000-0000-4000-8000-000000000012"}',
    '{"conversation_id":"72000000-0000-4000-8000-000000000012","role":"user"}');
  PERFORM public.claim_source_message_ingress(
    '72000000-0000-4000-8000-000000000001', 'chat', 'k3-aside', NULL, 'k3-proof',
    'K3 aside eligibility', 'conversation', 'conversation', 'user',
    ARRAY['72000000-0000-4000-8000-000000000001']::uuid[], '{}'::uuid[],
    '{"session_id":"72000000-0000-4000-8000-000000000012","source":"aside"}',
    '{"conversation_id":"72000000-0000-4000-8000-000000000012","role":"user"}');
  PERFORM public.claim_source_message_ingress(
    '72000000-0000-4000-8000-000000000001', 'chat', 'k3-room',
    '72000000-0000-4000-8000-000000000011', 'k3-proof',
    'K3 room eligibility', 'message', 'conversation', 'user',
    ARRAY['72000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000002']::uuid[],
    ARRAY['72000000-0000-4000-8000-000000000002']::uuid[],
    '{"session_id":"72000000-0000-4000-8000-000000000012","source":"room"}',
    '{"conversation_id":"72000000-0000-4000-8000-000000000012","role":"user"}');
  PERFORM public.claim_source_message_ingress(
    '72000000-0000-4000-8000-000000000001', 'chat', 'k3-concurrency',
    '72000000-0000-4000-8000-000000000011', 'k3-proof',
    'Elisheya keeps the amber notebook.', 'message', 'conversation', 'user',
    ARRAY['72000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000002']::uuid[],
    ARRAY['72000000-0000-4000-8000-000000000002']::uuid[],
    '{"session_id":"72000000-0000-4000-8000-000000000012","source":"room"}',
    '{"conversation_id":"72000000-0000-4000-8000-000000000012","role":"user"}');
  PERFORM public.claim_source_message_ingress(
    '72000000-0000-4000-8000-000000000001', 'chat', 'k3-conflict',
    '72000000-0000-4000-8000-000000000011', 'k3-proof',
    'K3 conflict source', 'message', 'conversation', 'user',
    ARRAY['72000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000002']::uuid[], '{}'::uuid[],
    '{"session_id":"72000000-0000-4000-8000-000000000012"}',
    '{"conversation_id":"72000000-0000-4000-8000-000000000012","role":"user"}');
  PERFORM public.claim_source_message_ingress(
    '72000000-0000-4000-8000-000000000001', 'chat', 'k3-failure', NULL, NULL,
    'K3 failure then retry', 'conversation', 'conversation', 'user',
    ARRAY['72000000-0000-4000-8000-000000000001']::uuid[], '{}'::uuid[],
    '{"session_id":"72000000-0000-4000-8000-000000000012"}',
    '{"conversation_id":"72000000-0000-4000-8000-000000000012","role":"user"}');
  PERFORM public.claim_source_message_ingress(
    '72000000-0000-4000-8000-000000000001', 'chat', 'k3-payload-mismatch',
    NULL, NULL, 'K3 payload mismatch', 'conversation', 'conversation', 'user',
    ARRAY['72000000-0000-4000-8000-000000000001']::uuid[], '{}'::uuid[],
    '{"session_id":"72000000-0000-4000-8000-000000000012"}',
    '{"conversation_id":"72000000-0000-4000-8000-000000000012","role":"user"}');
  PERFORM public.claim_source_message_ingress(
    '72000000-0000-4000-8000-000000000001', 'chat', 'k3-no-claim', NULL, NULL,
    'thanks', 'conversation', 'conversation', 'user',
    ARRAY['72000000-0000-4000-8000-000000000001']::uuid[], '{}'::uuid[],
    '{"session_id":"72000000-0000-4000-8000-000000000012"}',
    '{"conversation_id":"72000000-0000-4000-8000-000000000012","role":"user"}');
  PERFORM public.claim_source_message_ingress(
    '72000000-0000-4000-8000-000000000001', 'agent', format('reply:%s', v_private),
    NULL, NULL, 'K3 Voyager response', 'conversation', 'conversation', 'voyager',
    ARRAY['72000000-0000-4000-8000-000000000001']::uuid[], '{}'::uuid[],
    jsonb_build_object('session_id', '72000000-0000-4000-8000-000000000012',
      'reply_to_event_id', v_private),
    jsonb_build_object('conversation_id', '72000000-0000-4000-8000-000000000012',
      'role', 'assistant', 'reply_to_event_id', v_private));
END
$k3_setup$;

DO $k3_eligibility$
BEGIN
  IF (SELECT count(*) FROM public.knowledge_extraction_jobs job
      JOIN public.knowledge_events event ON event.id = job.source_event_id
      WHERE event.content LIKE 'K3 %' OR event.content = 'thanks'
        OR event.content = 'Elisheya keeps the amber notebook.') <> 8 THEN
    RAISE EXCEPTION 'k3_human_eligibility_count_failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.knowledge_extraction_jobs job
      JOIN public.knowledge_events event ON event.id = job.source_event_id
      WHERE event.actor_type = 'voyager') THEN
    RAISE EXCEPTION 'k3_voyager_event_became_eligible';
  END IF;
  IF EXISTS (SELECT 1 FROM public.knowledge_extraction_jobs job
      JOIN public.knowledge_events event ON event.id = job.source_event_id
      WHERE job.knowledge_audience_id IS DISTINCT FROM event.knowledge_audience_id) THEN
    RAISE EXCEPTION 'k3_job_audience_not_inherited';
  END IF;
END
$k3_eligibility$;
