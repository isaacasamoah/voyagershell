import type { K1FixtureSeed } from './k1-fixture-seed'

const quote = (value: string): string => `'${value.replaceAll("'", "''")}'`
const legacyRelation = ['knowledge', 'edges'].join('_')

export const renderK1LegacySetupSql = (seed: K1FixtureSeed): string => {
  const voyageSlug = `voyager-k1-${seed.voyageId}`
  const otherVoyageSlug = `voyager-k1-${seed.otherVoyageId}`
  const missingVoyageSlug = `voyager-k1-missing-${seed.unresolvedEventId}`
  return `
-- K1 controls exist only inside the hosted rollback transaction.
INSERT INTO auth.users(id, email, raw_user_meta_data, created_at) VALUES
  (${quote(seed.ownerId)}::uuid, ${quote(`voyager-k1-${seed.ownerId}@example.invalid`)},
    '{"display_name":"K1 owner"}'::jsonb, now()),
  (${quote(seed.recipientId)}::uuid, ${quote(`voyager-k1-${seed.recipientId}@example.invalid`)},
    '{"display_name":"K1 recipient"}'::jsonb, now());
INSERT INTO public.voyages(id, slug, name) VALUES
  (${quote(seed.voyageId)}::uuid, ${quote(voyageSlug)}, 'K1 backfill'),
  (${quote(seed.otherVoyageId)}::uuid, ${quote(otherVoyageSlug)}, 'K1 other');
INSERT INTO public.voyage_members(id, voyage_id, user_id, role) VALUES
  (${quote(seed.voyageMemberId)}::uuid, ${quote(seed.voyageId)}::uuid,
    ${quote(seed.ownerId)}::uuid, 'crew'),
  (${quote(seed.recipientVoyageMemberId)}::uuid, ${quote(seed.voyageId)}::uuid,
    ${quote(seed.recipientId)}::uuid, 'crew');
INSERT INTO public.spaces(id, voyage_id, created_by) VALUES
  (${quote(seed.spaceId)}::uuid, ${quote(seed.voyageId)}::uuid, ${quote(seed.ownerId)}::uuid),
  (${quote(seed.orphanSpaceId)}::uuid, NULL, ${quote(seed.ownerId)}::uuid);
INSERT INTO public.space_members(space_id, user_id, state) VALUES
  (${quote(seed.spaceId)}::uuid, ${quote(seed.ownerId)}::uuid, 'active'),
  (${quote(seed.spaceId)}::uuid, ${quote(seed.recipientId)}::uuid, 'active'),
  (${quote(seed.orphanSpaceId)}::uuid, ${quote(seed.ownerId)}::uuid, 'active'),
  (${quote(seed.orphanSpaceId)}::uuid, ${quote(seed.recipientId)}::uuid, 'active');
INSERT INTO public.sessions(id, user_id, voyage_id, space_id, status) VALUES
  (${quote(seed.sessionId)}::uuid, ${quote(seed.ownerId)}::uuid,
    ${quote(seed.voyageId)}::uuid, ${quote(seed.spaceId)}::uuid, 'historical'),
  (${quote(seed.recipientSessionId)}::uuid, ${quote(seed.recipientId)}::uuid,
    ${quote(seed.voyageId)}::uuid, ${quote(seed.spaceId)}::uuid, 'historical'),
  (${quote(seed.orphanSessionId)}::uuid, ${quote(seed.ownerId)}::uuid,
    NULL, ${quote(seed.orphanSpaceId)}::uuid, 'historical'),
  (${quote(seed.mismatchedSessionId)}::uuid, ${quote(seed.ownerId)}::uuid,
    ${quote(seed.voyageId)}::uuid, ${quote(seed.orphanSpaceId)}::uuid, 'historical'),
  (${quote(seed.crossVoyageSessionId)}::uuid, ${quote(seed.ownerId)}::uuid,
    ${quote(seed.otherVoyageId)}::uuid, NULL, 'historical');
INSERT INTO public.knowledge_events(id, event_type, user_id, voyage_slug, content,
  metadata, source_type, actor_type, participants, sequence_num) VALUES
  (${quote(seed.eligibleSourceId)}::uuid, 'message', ${quote(seed.ownerId)}::uuid,
    NULL, 'K1 eligible source', '{}'::jsonb, 'explicit', 'pipeline', ARRAY[${quote(seed.ownerId)}::uuid], -319300),
  (${quote(seed.eligibleTargetId)}::uuid, 'message', ${quote(seed.ownerId)}::uuid,
    NULL, 'K1 eligible target', '{}'::jsonb, 'explicit', 'pipeline', ARRAY[${quote(seed.ownerId)}::uuid], -319301),
  (${quote(seed.unresolvedEventId)}::uuid, 'message', ${quote(seed.ownerId)}::uuid,
    ${quote(missingVoyageSlug)}, 'K1 unresolved', '{}'::jsonb, 'explicit', 'pipeline', NULL, -319302),
  (${quote(seed.voyageEventId)}::uuid, 'message', ${quote(seed.ownerId)}::uuid,
    ${quote(voyageSlug)}, 'K1 voyage source', '{}'::jsonb, 'explicit', 'pipeline',
    ARRAY[${quote(seed.ownerId)}::uuid, ${quote(seed.recipientId)}::uuid], -319303),
  (${quote(seed.spaceEventId)}::uuid, 'message', ${quote(seed.ownerId)}::uuid,
    ${quote(voyageSlug)}, 'K1 space source',
    ${quote(JSON.stringify({ session_id: seed.sessionId }))}::jsonb, 'explicit', 'pipeline',
    ARRAY[${quote(seed.ownerId)}::uuid, ${quote(seed.recipientId)}::uuid], -319304),
  (${quote(seed.orphanSpaceEventId)}::uuid, 'message', ${quote(seed.ownerId)}::uuid,
    NULL, 'K1 standalone space source',
    ${quote(JSON.stringify({ session_id: seed.orphanSessionId }))}::jsonb, 'explicit', 'pipeline',
    ARRAY[${quote(seed.ownerId)}::uuid, ${quote(seed.recipientId)}::uuid], -319309),
  (${quote(seed.unlinkedPersonalEventId)}::uuid, 'message', ${quote(seed.ownerId)}::uuid,
    NULL, 'K1 unlinked multi-person source', '{}'::jsonb, 'explicit', 'pipeline',
    ARRAY[${quote(seed.ownerId)}::uuid, ${quote(seed.recipientId)}::uuid], -319310),
  (${quote(seed.malformedSessionEventId)}::uuid, 'message', ${quote(seed.ownerId)}::uuid,
    ${quote(voyageSlug)}, 'K1 malformed session', '{"session_id":"not-a-uuid"}'::jsonb,
    'explicit', 'pipeline', ARRAY[${quote(seed.ownerId)}::uuid, ${quote(seed.recipientId)}::uuid], -319305),
  (${quote(seed.mismatchedSpaceEventId)}::uuid, 'message', ${quote(seed.ownerId)}::uuid,
    ${quote(voyageSlug)}, 'K1 mismatched space',
    ${quote(JSON.stringify({ session_id: seed.mismatchedSessionId }))}::jsonb, 'explicit', 'pipeline',
    ARRAY[${quote(seed.ownerId)}::uuid, ${quote(seed.recipientId)}::uuid], -319306),
  (${quote(seed.crossVoyageSessionEventId)}::uuid, 'message', ${quote(seed.ownerId)}::uuid,
    ${quote(voyageSlug)}, 'K1 cross-voyage session',
    ${quote(JSON.stringify({ session_id: seed.crossVoyageSessionId }))}::jsonb, 'explicit', 'pipeline',
    ARRAY[${quote(seed.ownerId)}::uuid, ${quote(seed.recipientId)}::uuid], -319307);
SET LOCAL ROLE authenticated;
INSERT INTO public.${legacyRelation}(id, source_id, target_id, edge_type, created_by) VALUES
  (${quote(seed.eligibleEdgeId)}::uuid, ${quote(seed.eligibleSourceId)}::uuid,
    ${quote(seed.eligibleTargetId)}::uuid, 'relates_to', 'spoofed-trusted-writer'),
  (${quote(seed.unresolvedEdgeId)}::uuid, ${quote(seed.eligibleSourceId)}::uuid,
    ${quote(seed.unresolvedEventId)}::uuid, 'relates_to', 'spoofed-trusted-writer');
RESET ROLE;
`
}
