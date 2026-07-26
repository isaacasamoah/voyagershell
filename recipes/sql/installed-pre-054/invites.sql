-- A real pre-cutover knock: the pending membership identifies a room, but the
-- immutable event does not. No migration may guess that these facts correspond.
INSERT INTO auth.users(id, email) VALUES
  ('14000000-0000-4000-8000-000000000001', 'legacy-inviter@installed.local'),
  ('14000000-0000-4000-8000-000000000002', 'legacy-invitee@installed.local');
INSERT INTO public.voyages(id, slug, name, created_by) VALUES (
  '24000000-0000-4000-8000-000000000001',
  'installed-invite',
  'Installed Invite',
  '14000000-0000-4000-8000-000000000001'
);
INSERT INTO public.voyage_members(id, voyage_id, user_id, role) VALUES
  ('34000000-0000-4000-8000-000000000001',
   '24000000-0000-4000-8000-000000000001',
   '14000000-0000-4000-8000-000000000001', 'captain'),
  ('34000000-0000-4000-8000-000000000002',
   '24000000-0000-4000-8000-000000000001',
   '14000000-0000-4000-8000-000000000002', 'crew');
INSERT INTO public.spaces(id, voyage_id, created_by) VALUES (
  '44000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001'
);
INSERT INTO public.space_members(space_id, user_id, state) VALUES
  ('44000000-0000-4000-8000-000000000001',
   '14000000-0000-4000-8000-000000000001', 'active'),
  ('44000000-0000-4000-8000-000000000001',
   '14000000-0000-4000-8000-000000000002', 'invited');
INSERT INTO public.sessions(id, user_id, status, voyage_id, space_id) VALUES
  ('54000000-0000-4000-8000-000000000001',
   '14000000-0000-4000-8000-000000000001', 'active',
   '24000000-0000-4000-8000-000000000001',
   '44000000-0000-4000-8000-000000000001'),
  ('54000000-0000-4000-8000-000000000002',
   '14000000-0000-4000-8000-000000000002', 'active',
   '24000000-0000-4000-8000-000000000001', NULL);
INSERT INTO public.knowledge_events(
  id, event_type, user_id, voyage_slug, participants, content, metadata,
  source_type, source_ref, actor_id, actor_type
) VALUES (
  '64000000-0000-4000-8000-000000000001',
  'message',
  '14000000-0000-4000-8000-000000000001',
  'installed-invite',
  ARRAY['14000000-0000-4000-8000-000000000002']::uuid[],
  'Legacy Inviter invited you to a room — reply to join.',
  '{"classifications":[],"entities":[],"topics":[],
    "session_id":"54000000-0000-4000-8000-000000000001",
    "source":"invite",
    "sender_display_name":"Legacy Inviter",
    "sender_user_id":"14000000-0000-4000-8000-000000000001"}',
  'conversation',
  '{"conversation_id":"54000000-0000-4000-8000-000000000001","role":"user"}',
  '14000000-0000-4000-8000-000000000001',
  'user'
);
