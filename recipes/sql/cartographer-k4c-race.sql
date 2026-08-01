\set ON_ERROR_STOP on
SELECT attempt_id
FROM public.begin_relation_attempt(
  '72000000-0000-4000-8000-000000000001',
  'openai',
  'race-model',
  'balanced',
  (SELECT id FROM public.knowledge_units WHERE claim = 'K4c race focus.'),
  120
);
