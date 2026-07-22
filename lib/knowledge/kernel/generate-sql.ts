import { writeFileSync } from 'node:fs'
import { renderKnowledgeGraphAssertions } from './assertions-sql'
import type { KnowledgeGraphFixture } from './contract'
import { knowledgeGraphFixture } from './fixture'
import { hashExpression, quote, uuid, uuidArray, valuesSql } from './sql'

const renderAuthoritySetup = (fixture: KnowledgeGraphFixture): string => {
  const people = fixture.nodes.filter((node) => node.kind === 'person')
  const voyage = fixture.nodes.find((node) => node.kind === 'voyage')!
  const space = fixture.nodes.find((node) => node.kind === 'space')!
  const authRows = people.map((person, index) =>
    [
      uuid(person.authorityId),
      quote('authenticated'),
      quote('authenticated'),
      quote(`oru-319-fixture-${index + 1}@example.invalid`),
      `'{}'::jsonb`,
      `${quote(JSON.stringify({ display_name: person.label }))}::jsonb`,
      'now()',
      'now()',
    ].join(', '),
  )
  const memberRows = people.map((person) =>
    [uuid(voyage.authorityId), uuid(person.authorityId), quote('crew')].join(', '),
  )
  const spaceMemberRows = people.map((person) =>
    [uuid(space.authorityId), uuid(person.authorityId), quote('active')].join(', '),
  )

  return `
-- Fixture authority rows exist only inside the outer rollback transaction.
INSERT INTO auth.users
  (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
${valuesSql(authRows)}
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.voyages (id, slug, name) VALUES
  (${uuid(voyage.authorityId)}, 'oru-319-knowledge-graph-fixture', 'ORU-319 fixture')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.voyage_members (voyage_id, user_id, role) VALUES
${valuesSql(memberRows)}
ON CONFLICT (voyage_id, user_id) DO NOTHING;
INSERT INTO public.spaces (id, voyage_id, created_by) VALUES
  (${uuid(space.authorityId)}, ${uuid(voyage.authorityId)}, ${uuid(people[0].authorityId)})
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.space_members (space_id, user_id, state) VALUES
${valuesSql(spaceMemberRows)}
ON CONFLICT (space_id, user_id) DO NOTHING;
`
}

const renderProjection = (fixture: KnowledgeGraphFixture, renamed: boolean): string => {
  const audiences = new Map(fixture.audiences.map((audience) => [audience.key, audience]))
  const beforeLabels = new Map(fixture.renames.map((rename) => [rename.nodeId, rename.beforeLabel]))
  const audienceRows = fixture.audiences.map((audience) =>
    [
      uuid(audience.id),
      `${quote(audience.scopeKind)}::public.knowledge_audience_scope_kind`,
      uuid(audience.scopeAuthorityId),
      uuidArray(audience.memberProfileIds),
    ].join(', '),
  )
  const eventRows = fixture.events.map((event) =>
    [
      uuid(event.id),
      quote('message'),
      'NULL::uuid',
      quote('oru-319-knowledge-graph-fixture'),
      quote(event.content),
      `${quote(JSON.stringify({ classifications: [], entities: [], topics: [] }))}::jsonb`,
      quote('explicit'),
      quote('pipeline'),
      'NULL::uuid[]',
      uuid(audiences.get(event.audienceKey)!.id),
    ].join(', '),
  )
  const unitRows = fixture.units.map((unit) =>
    [
      uuid(unit.id),
      quote(unit.claim),
      uuid(unit.sourceEventId),
      quote(unit.extractorVersion),
      quote(unit.claimKey),
      uuid(audiences.get(unit.audienceKey)!.id),
    ].join(', '),
  )
  const nodeRows = fixture.nodes.map((node) =>
    [
      uuid(node.id),
      `${quote(node.kind)}::public.graph_node_kind`,
      uuid(node.authorityId),
      quote(renamed ? node.label : (beforeLabels.get(node.id) ?? node.label)),
      uuid(audiences.get(node.audienceKey)!.id),
    ].join(', '),
  )
  const edgeRows = fixture.edges.map((edge) =>
    [
      uuid(edge.sourceNodeId),
      uuid(edge.targetNodeId),
      `${quote(edge.kind)}::public.graph_edge_kind`,
      uuid(audiences.get(edge.audienceKey)!.id),
    ].join(', '),
  )

  return `
-- fixture projection: ${renamed ? 'renamed' : 'initial'}
INSERT INTO public.knowledge_audiences
  (id, scope_kind, scope_authority_id, member_profile_ids) VALUES
${valuesSql(audienceRows)}
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.knowledge_events
  (id, event_type, user_id, voyage_slug, content, metadata, source_type,
    actor_type, participants, knowledge_audience_id) VALUES
${valuesSql(eventRows)}
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.knowledge_units
  (id, claim, source_event_id, extractor_version, claim_key, knowledge_audience_id) VALUES
${valuesSql(unitRows)}
ON CONFLICT (source_event_id, extractor_version, claim_key) DO NOTHING;
INSERT INTO public.graph_nodes (id, kind, authority_id, label, knowledge_audience_id) VALUES
${valuesSql(nodeRows)}
ON CONFLICT (kind, authority_id) DO UPDATE SET label = EXCLUDED.label
WHERE graph_nodes.id = EXCLUDED.id
  AND graph_nodes.knowledge_audience_id = EXCLUDED.knowledge_audience_id;
INSERT INTO public.graph_edges
  (source_node_id, target_node_id, kind, knowledge_audience_id) VALUES
${valuesSql(edgeRows)}
ON CONFLICT (source_node_id, target_node_id, kind) DO NOTHING;
`
}

export const renderKnowledgeGraphSql = (
  fixture: KnowledgeGraphFixture = knowledgeGraphFixture,
): string => {
  const initial = renderProjection(fixture, false)
  const renamed = renderProjection(fixture, true)
  return `${renderAuthoritySetup(fixture)}${initial}
CREATE TEMP TABLE knowledge_graph_projection_snapshot AS SELECT
  ${hashExpression('events', fixture)} AS events_hash,
  ${hashExpression('units', fixture)} AS units_hash,
  ${hashExpression('nodes', fixture)} AS nodes_hash,
  ${hashExpression('edges', fixture)} AS edges_hash;
${renamed}${renderKnowledgeGraphAssertions(fixture)}`
}

const outputFlag = process.argv.indexOf('--output')
if (outputFlag >= 0) {
  const outputPath = process.argv[outputFlag + 1]
  if (!outputPath) throw new Error('knowledge_graph_sql_output_required')
  writeFileSync(outputPath, renderKnowledgeGraphSql(), { encoding: 'utf8', mode: 0o600 })
}
