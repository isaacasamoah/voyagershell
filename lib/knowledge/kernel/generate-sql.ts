import { writeFileSync } from 'node:fs'
import { renderKnowledgeGraphAssertions } from './assertions-sql'
import { canonicalSpaceMemberId } from './canonical-ids'
import type { KnowledgeGraphFixture } from './contract'
import { knowledgeGraphFixture } from './fixture'
import { renderAuthorityScenarioAssertions } from './authority-assertions-sql'
import { renderAuthorityTargetPlanAssertionsSql } from './authority-plan-assertions-sql'
import { renderGraphAclAssertionsSql } from './acl-assertions-sql'
import { renderFrontierAssertionsSql } from './frontier-assertions-sql'
import { renderKnowledgeGraphRetrievalAssertions } from './retrieval-assertions-sql'
import { hashExpression, quote, uuid, uuidArray, valuesSql } from './sql'

const MEMBER_IDS = {
  redA: '91000000-0000-4000-8000-000000000001',
  redB: '91000000-0000-4000-8000-000000000002',
  blueA: '91000000-0000-4000-8000-000000000003',
  blueC: '91000000-0000-4000-8000-000000000004',
  redD: '91000000-0000-4000-8000-000000000005',
  redSpaceA: canonicalSpaceMemberId('51000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'),
  redSpaceB: canonicalSpaceMemberId('51000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002'),
  blueSpaceA: canonicalSpaceMemberId('51000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001'),
  blueSpaceC: canonicalSpaceMemberId('51000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003'),
  redSpaceD: canonicalSpaceMemberId('51000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000004'),
} as const

const renderAuthoritySetup = (fixture: KnowledgeGraphFixture): string => {
  const ids = fixture.viewerProfileIds
  const scenario = fixture.authorityScenario
  const profiles = [
    [ids.a, 'Vanessa Vale', 'vega'], [ids.b, 'Isaac', 'wren'],
    [ids.c, 'Mae', 'lumen'], [ids.d, 'Rafi', 'kepler'],
  ] as const
  const authRows = profiles.map(([id, label], index) => [
    uuid(id), quote(`oru-319-fixture-${index + 1}@example.invalid`),
    `${quote(JSON.stringify({ display_name: label }))}::jsonb`, 'now()',
  ].join(', '))
  const voyageMembers = [
    [MEMBER_IDS.redA, scenario.redVoyageId, ids.a], [MEMBER_IDS.redB, scenario.redVoyageId, ids.b],
    [MEMBER_IDS.blueA, scenario.blueVoyageId, ids.a], [MEMBER_IDS.blueC, scenario.blueVoyageId, ids.c],
  ].map((row) => row.map(uuid).join(', '))
  const spaceMembers = [
    [scenario.redSpaceId, ids.a], [scenario.redSpaceId, ids.b],
    [scenario.blueSpaceId, ids.a], [scenario.blueSpaceId, ids.c],
  ].map((row) => `${row.map(uuid).join(', ')}, 'active'`)
  return `
-- The existing fixture now has two disjoint authority scopes and one shared identity.
INSERT INTO auth.users
  (id, email, raw_user_meta_data, created_at) VALUES
${valuesSql(authRows)} ON CONFLICT (id) DO NOTHING;
${profiles.map(([id, , username]) => `UPDATE public.profiles SET username = ${quote(username)} WHERE id = ${uuid(id)};`).join('\n')}
INSERT INTO public.voyages(id, slug, name) VALUES
  (${uuid(scenario.redVoyageId)}, 'oru-319-red', 'Red Voyage'),
  (${uuid(scenario.blueVoyageId)}, 'oru-319-blue', 'Blue Voyage') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.voyage_members(id, voyage_id, user_id, role) VALUES
${valuesSql(voyageMembers.map((row) => `${row}, 'crew'`))} ON CONFLICT (voyage_id, user_id) DO NOTHING;
INSERT INTO public.spaces(id, voyage_id, created_by) VALUES
  (${uuid(scenario.redSpaceId)}, ${uuid(scenario.redVoyageId)}, ${uuid(ids.a)}),
  (${uuid(scenario.blueSpaceId)}, ${uuid(scenario.blueVoyageId)}, ${uuid(ids.a)}) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.space_members(space_id, user_id, state) VALUES
${valuesSql(spaceMembers)} ON CONFLICT (space_id, user_id) DO NOTHING;
`
}

const renderProjection = (fixture: KnowledgeGraphFixture): string => {
  const audiences = new Map(fixture.audiences.map((audience) => [audience.key, audience]))
  const beforeLabels = new Map(fixture.renames.map((rename) => [rename.nodeId, rename.beforeLabel]))
  const audienceRows = fixture.audiences.map((audience) => [
    uuid(audience.id), `${quote(audience.purpose)}::public.knowledge_audience_purpose`,
    `${quote(audience.scopeKind)}::public.knowledge_audience_scope_kind`,
    uuid(audience.scopeAuthorityId), uuidArray(audience.memberProfileIds),
  ].join(', '))
  const eventRows = fixture.events.map((event, index) => [
    uuid(event.id), quote('message'), uuid(fixture.authorityScenario.crossScopePersonId),
    quote('oru-319-knowledge-graph-fixture'),
    quote(event.content), `'{}'::jsonb`, quote('explicit'), quote('pipeline'),
    'NULL::uuid[]', uuid(audiences.get(event.audienceKey)!.id), String(-319_100 - index),
  ].join(', '))
  const unitRows = fixture.units.map((unit) => [
    uuid(unit.id), quote(unit.claim), uuid(unit.sourceEventId), quote(unit.extractorVersion),
    quote(unit.claimKey), uuid(audiences.get(unit.audienceKey)!.id),
  ].join(', '))
  const nodeRows = fixture.nodes.map((node) => [
    uuid(node.id), `${quote(node.kind)}::public.graph_node_kind`, uuid(node.authorityId),
    quote(beforeLabels.get(node.id) ?? node.label),
  ].join(', '))
  const grantRows = fixture.grants.map((grant) => [
    uuid(grant.nodeId), uuid(audiences.get(grant.audienceKey)!.id), quote(grant.basisKind),
    uuid(grant.basisId), '1', quote(grant.labelSnapshot), 'now()',
    grant.basisEventId ? uuid(grant.basisEventId) : 'NULL::uuid',
  ].join(', '))
  const edgeRows = fixture.edges.map((edge) => [
    uuid(edge.id), uuid(edge.sourceNodeId), uuid(edge.targetNodeId),
    `${quote(edge.kind)}::public.graph_edge_kind`,
  ].join(', '))
  const evidenceRows = fixture.edges.flatMap((edge) => edge.evidenceEventIds.map((eventId) => [
    uuid(edge.id), uuid(eventId),
  ].join(', ')))
  return `
INSERT INTO public.knowledge_audiences
  (id, purpose, scope_kind, scope_authority_id, member_profile_ids) VALUES
${valuesSql(audienceRows)} ON CONFLICT DO NOTHING;
INSERT INTO public.knowledge_events(id, event_type, user_id, voyage_slug, content,
  metadata, source_type, actor_type, participants, knowledge_audience_id, sequence_num) VALUES
${valuesSql(eventRows)} ON CONFLICT (id) DO NOTHING;
INSERT INTO public.knowledge_units(id, claim, source_event_id, extractor_version,
  claim_key, knowledge_audience_id) VALUES
${valuesSql(unitRows)} ON CONFLICT (source_event_id, extractor_version, claim_key) DO NOTHING;
INSERT INTO public.graph_nodes(id, kind, authority_id, label) VALUES
${valuesSql(nodeRows)} ON CONFLICT (kind, authority_id) DO NOTHING;
INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind) VALUES
${valuesSql(edgeRows)} ON CONFLICT DO NOTHING;
INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id) VALUES
${valuesSql(evidenceRows)} ON CONFLICT DO NOTHING;
INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind,
  basis_id, basis_version, label_snapshot, granted_at, basis_event_id) VALUES
${valuesSql(grantRows)} ON CONFLICT DO NOTHING;
`
}

export const renderKnowledgeGraphSql = (
  fixture: KnowledgeGraphFixture = knowledgeGraphFixture,
): string => {
  const projection = renderProjection(fixture)
  return `${renderAuthoritySetup(fixture)}${projection}
CREATE TEMP TABLE knowledge_graph_projection_snapshot AS SELECT
  ${hashExpression('events', fixture)} events_hash, ${hashExpression('units', fixture)} units_hash,
  ${hashExpression('nodes', fixture)} nodes_hash, ${hashExpression('edges', fixture)} edges_hash,
  ${hashExpression('grants', fixture)} grants_hash,
  ${hashExpression('authorityEdges', fixture)} authority_edges_hash;
${projection}${renderKnowledgeGraphAssertions(fixture)}${renderKnowledgeGraphRetrievalAssertions(fixture)}${renderAuthorityScenarioAssertions(fixture, MEMBER_IDS)}${renderGraphAclAssertionsSql(fixture)}${renderAuthorityTargetPlanAssertionsSql()}${renderFrontierAssertionsSql(fixture)}`
}

const outputFlag = process.argv.indexOf('--output')
if (outputFlag >= 0) {
  const outputPath = process.argv[outputFlag + 1]
  if (!outputPath) throw new Error('knowledge_graph_sql_output_required')
  writeFileSync(outputPath, renderKnowledgeGraphSql(), { encoding: 'utf8', mode: 0o600 })
}
