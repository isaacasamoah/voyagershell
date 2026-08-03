-- Seed one already-eligible gap and one C5-only shape before migration 080.
ALTER TABLE public.knowledge_events DISABLE TRIGGER trg_enqueue_human_knowledge_extraction;
INSERT INTO public.knowledge_events(
  id, user_id, event_type, content, metadata, source_type, source_ref,
  actor_id, actor_type, created_at, participants, knowledge_audience_id
) VALUES (
  '80000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001', 'message',
  'K5a 080 already-eligible backfill sentinel.', '{"proof":"k5a-080"}',
  'conversation', '{"proof_key":"k5a-080-eligible"}',
  '72000000-0000-4000-8000-000000000001', 'user', clock_timestamp(),
  ARRAY['72000000-0000-4000-8000-000000000001']::uuid[],
  public.canonical_knowledge_audience_id(
    'source', 'private', '72000000-0000-4000-8000-000000000001',
    ARRAY['72000000-0000-4000-8000-000000000001']::uuid[]
  )
), (
  '80000000-0000-4000-8000-000000000002',
  '72000000-0000-4000-8000-000000000001', 'document',
  'K5a 080 deferred C5 sentinel.', '{"proof":"k5a-080"}',
  'document', '{"proof_key":"k5a-080-deferred"}',
  '72000000-0000-4000-8000-000000000001', 'user', clock_timestamp(),
  ARRAY['72000000-0000-4000-8000-000000000001']::uuid[],
  public.canonical_knowledge_audience_id(
    'source', 'private', '72000000-0000-4000-8000-000000000001',
    ARRAY['72000000-0000-4000-8000-000000000001']::uuid[]
  )
) ON CONFLICT DO NOTHING;
ALTER TABLE public.knowledge_events ENABLE TRIGGER trg_enqueue_human_knowledge_extraction;
