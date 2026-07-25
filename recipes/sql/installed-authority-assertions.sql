SET statement_timeout = '30s';
INSERT INTO auth.users(id, email) VALUES
  ('10000000-0000-4000-8000-000000000001', 'owner@installed.local'),
  ('10000000-0000-4000-8000-000000000002', 'member@installed.local'),
  ('10000000-0000-4000-8000-000000000003', 'outsider@installed.local');
INSERT INTO public.voyages(id, slug, name, created_by) VALUES
  ('20000000-0000-4000-8000-000000000001', 'installed-authority', 'Installed Authority',
   '10000000-0000-4000-8000-000000000001');
INSERT INTO public.voyage_members(id, voyage_id, user_id, role) VALUES
  ('21000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', 'captain'),
  ('21000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002', 'crew');
INSERT INTO public.sessions(id, user_id, status) VALUES
  ('22000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'historical'),
  ('22000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'active');
INSERT INTO public.knowledge_events(
  id, event_type, user_id, voyage_slug, participants, content, metadata,
  source_type, actor_id, actor_type)
VALUES
  ('30000000-0000-4000-8000-000000000001', 'explicit',
   '10000000-0000-4000-8000-000000000001', 'installed-authority',
   ARRAY['10000000-0000-4000-8000-000000000001',
     '10000000-0000-4000-8000-000000000002']::uuid[],
   'Visible exact knowledge.', '{"classifications":[],"entities":[],"topics":[]}',
   'explicit', '10000000-0000-4000-8000-000000000001', 'user'),
  ('30000000-0000-4000-8000-000000000002', 'message',
   '10000000-0000-4000-8000-000000000001', 'installed-authority',
   ARRAY['10000000-0000-4000-8000-000000000001',
     '10000000-0000-4000-8000-000000000002']::uuid[],
   'Member mention.', '{"classifications":[],"entities":[],"topics":[],
     "addressed_to":["10000000-0000-4000-8000-000000000002"],
     "sender_display_name":"Owner",
     "sender_user_id":"10000000-0000-4000-8000-000000000001"}',
   'conversation', '10000000-0000-4000-8000-000000000001', 'user'),
  ('30000000-0000-4000-8000-000000000003', 'explicit',
   '10000000-0000-4000-8000-000000000001', NULL,
   ARRAY['10000000-0000-4000-8000-000000000001']::uuid[],
   'Hidden root.', '{"classifications":[],"entities":[],"topics":[]}',
   'explicit', '10000000-0000-4000-8000-000000000001', 'user'),
  ('30000000-0000-4000-8000-000000000004', 'explicit',
   '10000000-0000-4000-8000-000000000001', 'installed-authority', NULL,
   'Visible bridge root.', '{"classifications":[],"entities":[],"topics":[]}',
   'explicit', '10000000-0000-4000-8000-000000000001', 'user'),
  ('30000000-0000-4000-8000-000000000005', 'explicit',
   '10000000-0000-4000-8000-000000000001', NULL,
   ARRAY['10000000-0000-4000-8000-000000000001']::uuid[],
   'Hidden bridge.', '{"classifications":[],"entities":[],"topics":[]}',
   'explicit', '10000000-0000-4000-8000-000000000001', 'user'),
  ('30000000-0000-4000-8000-000000000006', 'explicit',
   '10000000-0000-4000-8000-000000000001', 'installed-authority', NULL,
   'Visible beyond bridge.', '{"classifications":[],"entities":[],"topics":[]}',
   'explicit', '10000000-0000-4000-8000-000000000001', 'user'),
  ('30000000-0000-4000-8000-000000000007', 'explicit',
   '10000000-0000-4000-8000-000000000001', 'installed-authority', NULL,
   'Dense root.', '{"classifications":[],"entities":[],"topics":[]}',
   'explicit', '10000000-0000-4000-8000-000000000001', 'user'),
  ('30000000-0000-4000-8000-000000000008', 'explicit',
   '10000000-0000-4000-8000-000000000001', 'installed-authority', NULL,
   'Private preference.', '{"classifications":["preference"]}',
   'explicit', '10000000-0000-4000-8000-000000000001', 'user');
INSERT INTO public.knowledge_events(
  id, event_type, user_id, voyage_slug, content, metadata, source_type, actor_id, actor_type)
SELECT ('31000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid, 'explicit',
  '10000000-0000-4000-8000-000000000001', 'installed-authority',
  'Dense node ' || number, '{"classifications":[],"entities":[],"topics":[]}',
  'explicit', '10000000-0000-4000-8000-000000000001', 'user'
FROM generate_series(1, 12) number;
UPDATE public.knowledge_current SET knowledge_type = CASE
  WHEN event_id = '30000000-0000-4000-8000-000000000008' THEN 'preference'
  ELSE 'domain' END
WHERE voyage_slug = 'installed-authority' AND event_type = 'explicit';
INSERT INTO public.knowledge_edges(source_id, target_id, edge_type) VALUES
  ('30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'supports'),
  ('30000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000005', 'supports'),
  ('30000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000006', 'supports');
INSERT INTO public.knowledge_edges(source_id, target_id, edge_type)
SELECT '30000000-0000-4000-8000-000000000007',
  ('31000000-0000-4000-8000-' || lpad(number::text, 12, '0'))::uuid, 'supports'
FROM generate_series(1, 12) number;
INSERT INTO public.spaces(id, voyage_id, created_by) VALUES
  ('23000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001');
INSERT INTO public.voyages(id, slug, name, created_by) VALUES
  ('20000000-0000-4000-8000-000000000002', 'installed-secondary',
   'Installed Secondary', '10000000-0000-4000-8000-000000000001');
INSERT INTO public.voyage_members(id, voyage_id, user_id, role) VALUES
  ('21000000-0000-4000-8000-000000000003',
   '20000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000002', 'crew');
INSERT INTO public.sessions(id, user_id, status, voyage_id) VALUES
  ('22000000-0000-4000-8000-000000000003',
   '10000000-0000-4000-8000-000000000002', 'active',
   '20000000-0000-4000-8000-000000000001'),
  ('22000000-0000-4000-8000-000000000004',
   '10000000-0000-4000-8000-000000000002', 'historical',
   '20000000-0000-4000-8000-000000000001'),
  ('22000000-0000-4000-8000-000000000006',
   '10000000-0000-4000-8000-000000000002', 'active',
   '20000000-0000-4000-8000-000000000002');
SET ROLE service_role;
INSERT INTO public.space_members(space_id, user_id) VALUES
  ('23000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002');
UPDATE public.space_members SET state = 'active'
WHERE space_id = '23000000-0000-4000-8000-000000000001'
  AND user_id = '10000000-0000-4000-8000-000000000002';
DO $resume_service_role$
BEGIN
  IF (SELECT id FROM public.space_members
      WHERE space_id = '23000000-0000-4000-8000-000000000001'
        AND user_id = '10000000-0000-4000-8000-000000000002')
      <> public.canonical_space_member_id(
        '23000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000002')
  THEN
    RAISE EXCEPTION 'installed_space_member_identity_mismatch';
  END IF;
  BEGIN
    PERFORM public.resume_session('22000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'installed_cross_user_resume_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT count(*) FROM public.resume_session(
      '22000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000002')) <> 1
  THEN
    RAISE EXCEPTION 'installed_owned_resume_denied';
  END IF;
END
$resume_service_role$;
RESET ROLE;
DO $session_owner_inspection$
BEGIN
  IF (SELECT status FROM public.sessions
      WHERE id = '22000000-0000-4000-8000-000000000003')
      IS DISTINCT FROM 'historical'
    OR (SELECT status FROM public.sessions
      WHERE id = '22000000-0000-4000-8000-000000000004')
      IS DISTINCT FROM 'active'
    OR (SELECT status FROM public.sessions
      WHERE id = '22000000-0000-4000-8000-000000000002')
      IS DISTINCT FROM 'active'
    OR (SELECT status FROM public.sessions
      WHERE id = '22000000-0000-4000-8000-000000000006')
      IS DISTINCT FROM 'active'
  THEN
    RAISE EXCEPTION 'installed_resume_cross_context_mutation';
  END IF;
END
$session_owner_inspection$;
SET ROLE service_role;
DO $authority_service_role$
BEGIN
  IF (SELECT count(*) FROM public.get_knowledge_by_ids(
      ARRAY['30000000-0000-4000-8000-000000000001']::uuid[],
      '10000000-0000-4000-8000-000000000002', 'installed-authority')) <> 1
  THEN
    RAISE EXCEPTION 'installed_exact_id_active_denied';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_knowledge_by_ids(
      ARRAY['30000000-0000-4000-8000-000000000008']::uuid[],
      '10000000-0000-4000-8000-000000000002', 'installed-authority'))
  THEN
    RAISE EXCEPTION 'installed_member_preference_leaked';
  END IF;
  IF (SELECT count(*) FROM public.get_knowledge_by_ids(
      ARRAY['30000000-0000-4000-8000-000000000008']::uuid[],
      '10000000-0000-4000-8000-000000000001', 'installed-authority')) <> 1
  THEN
    RAISE EXCEPTION 'installed_owner_preference_denied';
  END IF;
  IF (SELECT count(*) FROM public.get_voyage_messages(
      '10000000-0000-4000-8000-000000000002', 'installed-authority',
      '2000-01-01'::timestamptz, 20)) <> 1
  THEN
    RAISE EXCEPTION 'installed_message_active_denied';
  END IF;
  IF EXISTS (SELECT 1 FROM public.graph_traverse(
      '30000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000002', 'installed-authority',
      NULL, 'outgoing', 2, 0, 50))
  THEN
    RAISE EXCEPTION 'installed_hidden_root_accepted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.graph_traverse(
      '30000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000002', 'installed-authority',
      NULL, 'outgoing', 2, 0, 50) WHERE event_id =
      '30000000-0000-4000-8000-000000000006')
  THEN
    RAISE EXCEPTION 'installed_hidden_bridge_crossed';
  END IF;
  IF (SELECT count(*) FROM public.graph_traverse(
      '30000000-0000-4000-8000-000000000007',
      '10000000-0000-4000-8000-000000000002', 'installed-authority',
      NULL, 'outgoing', 3, 0, 3)) <> 3
  THEN
    RAISE EXCEPTION 'installed_dense_budget_not_enforced';
  END IF;
END
$authority_service_role$;
RESET ROLE;
