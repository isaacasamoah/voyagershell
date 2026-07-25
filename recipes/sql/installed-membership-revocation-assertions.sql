SET statement_timeout = '30s';
UPDATE public.voyage_members SET state = 'left'
WHERE voyage_id = '20000000-0000-4000-8000-000000000001'
  AND user_id = '10000000-0000-4000-8000-000000000002';
SET ROLE service_role;
DO $left$
BEGIN
  BEGIN
    PERFORM public.get_knowledge_by_ids(
      ARRAY['30000000-0000-4000-8000-000000000001']::uuid[],
      '10000000-0000-4000-8000-000000000002', 'installed-authority');
    RAISE EXCEPTION 'installed_left_exact_id_accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.get_voyage_messages(
      '10000000-0000-4000-8000-000000000002', 'installed-authority',
      '2000-01-01'::timestamptz, 20);
    RAISE EXCEPTION 'installed_left_message_accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$left$;
RESET ROLE;
UPDATE public.voyage_members SET state = 'active'
WHERE voyage_id = '20000000-0000-4000-8000-000000000001'
  AND user_id = '10000000-0000-4000-8000-000000000002';
SET ROLE service_role;
DO $rejoined$
BEGIN
  IF (SELECT count(*) FROM public.get_knowledge_by_ids(
      ARRAY['30000000-0000-4000-8000-000000000001']::uuid[],
      '10000000-0000-4000-8000-000000000002', 'installed-authority')) <> 1
  THEN
    RAISE EXCEPTION 'installed_rejoined_exact_id_denied';
  END IF;
  IF (SELECT count(*) FROM public.get_voyage_messages(
      '10000000-0000-4000-8000-000000000002', 'installed-authority',
      '2000-01-01'::timestamptz, 20)) <> 1
  THEN
    RAISE EXCEPTION 'installed_rejoined_message_denied';
  END IF;
END
$rejoined$;
RESET ROLE;
SELECT 'INSTALLED_SCHEMA_AUTHORITY_GREEN';
