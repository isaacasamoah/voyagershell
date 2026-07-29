import fixtureJson from './fixtures/v1.json'
import {
  canonicalGraphEdgeId,
  canonicalGraphNodeId,
  canonicalKnowledgeAudienceId,
} from './canonical-ids'
import {
  AUTHORITY_EDGE_KINDS,
  GRAPH_EDGE_KINDS,
  K2_GRAPH_NODE_KINDS,
  GRAPH_GRANT_BASIS_KINDS,
  KNOWLEDGE_AUDIENCE_PURPOSES,
  KNOWLEDGE_AUDIENCE_SCOPE_KINDS,
  canonicalEdgeEndpoints,
  canonicalGraphIdentity,
  type KnowledgeGraphFixture,
} from './contract'

const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const fail = (path: string, reason: string): never => {
  throw new Error(`knowledge_graph_fixture_invalid:${path}:${reason}`)
}
const recordAt = (value: unknown, path: string): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'object_required')
  return value as Record<string, unknown>
}
const arrayAt = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) return fail(path, 'array_required')
  return value
}
const stringAt = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) return fail(path, 'string_required')
  return value
}
const uuidAt = (value: unknown, path: string): string => {
  const result = stringAt(value, path)
  if (!UUID_PATTERN.test(result)) fail(path, 'uuid_required')
  return result
}
const enumAt = <T extends string>(value: unknown, allowed: readonly T[], path: string): T => {
  const result = stringAt(value, path)
  if (!allowed.includes(result as T)) fail(path, 'unsupported_value')
  return result as T
}
const unique = (values: readonly string[], path: string): void => {
  if (new Set(values).size !== values.length) fail(path, 'duplicates_forbidden')
}

export const validateKnowledgeGraphFixture = (value: unknown): KnowledgeGraphFixture => {
  const fixture = recordAt(value, 'fixture')
  if (fixture.version !== 1) fail('version', 'must_equal_1')
  const viewers = recordAt(fixture.viewerProfileIds, 'viewerProfileIds')
  const viewerIds = ['a', 'b', 'c', 'd'].map((key) => uuidAt(viewers[key], `viewerProfileIds.${key}`))
  unique(viewerIds, 'viewerProfileIds')

  const audienceKeys = new Set<string>()
  const audienceIds = new Set<string>()
  const audiences = arrayAt(fixture.audiences, 'audiences').map((raw, index) => {
    const path = `audiences.${index}`
    const audience = recordAt(raw, path)
    const key = stringAt(audience.key, `${path}.key`)
    const id = uuidAt(audience.id, `${path}.id`)
    if (audienceKeys.has(key) || audienceIds.has(id)) fail(path, 'duplicate')
    audienceKeys.add(key); audienceIds.add(id)
    if (enumAt(audience.purpose, KNOWLEDGE_AUDIENCE_PURPOSES, `${path}.purpose`) !== 'source') {
      fail(`${path}.purpose`, 'fixture_sources_only')
    }
    const scopeKind = enumAt(audience.scopeKind, KNOWLEDGE_AUDIENCE_SCOPE_KINDS, `${path}.scopeKind`)
    const scopeAuthorityId = uuidAt(audience.scopeAuthorityId, `${path}.scopeAuthorityId`)
    const members = arrayAt(audience.memberProfileIds, `${path}.memberProfileIds`)
      .map((member, memberIndex) => uuidAt(member, `${path}.memberProfileIds.${memberIndex}`))
    if (members.length === 0) fail(`${path}.memberProfileIds`, 'empty_source_forbidden')
    unique(members, `${path}.memberProfileIds`)
    if ([...members].sort().join() !== members.join()) fail(`${path}.memberProfileIds`, 'canonical_order_required')
    if (id !== canonicalKnowledgeAudienceId('source', scopeKind, scopeAuthorityId, members)) {
      fail(`${path}.id`, 'not_canonical')
    }
    return audience
  })

  const nodeIds = new Set<string>()
  const identities = new Set<string>()
  const nodesById = new Map<string, Record<string, unknown>>()
  const kindCounts = new Map<string, number>()
  arrayAt(fixture.nodes, 'nodes').forEach((raw, index) => {
    const path = `nodes.${index}`
    const node = recordAt(raw, path)
    const id = uuidAt(node.id, `${path}.id`)
    const kind = enumAt(node.kind, K2_GRAPH_NODE_KINDS, `${path}.kind`)
    const authorityId = uuidAt(node.authorityId, `${path}.authorityId`)
    if (node.identity !== canonicalGraphIdentity(kind, authorityId)) fail(`${path}.identity`, 'not_canonical')
    if (id !== canonicalGraphNodeId(kind, authorityId)) fail(`${path}.id`, 'not_canonical')
    if (nodeIds.has(id) || identities.has(String(node.identity))) fail(path, 'duplicate_identity')
    nodeIds.add(id); identities.add(String(node.identity)); nodesById.set(id, node)
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1)
    stringAt(node.label, `${path}.label`)
  })
  if (K2_GRAPH_NODE_KINDS.some((kind) => !kindCounts.has(kind))) {
    fail('nodes', 'all_six_kinds_required')
  }
  if (kindCounts.get('person') !== 4 || kindCounts.get('voyager') !== 4) {
    fail('nodes', 'four_identity_pairs_required')
  }

  const eventIds = new Set<string>()
  const eventAudience = new Map<string, string>()
  arrayAt(fixture.events, 'events').forEach((raw, index) => {
    const path = `events.${index}`
    const event = recordAt(raw, path)
    const id = uuidAt(event.id, `${path}.id`)
    const node = nodesById.get(uuidAt(event.nodeId, `${path}.nodeId`))
    if (!node || node.kind !== 'message_event' || node.authorityId !== id) fail(path, 'message_authority_required')
    const key = stringAt(event.audienceKey, `${path}.audienceKey`)
    if (!audienceKeys.has(key)) fail(`${path}.audienceKey`, 'unknown')
    stringAt(event.content, `${path}.content`)
    eventIds.add(id); eventAudience.set(id, key)
  })
  if (eventIds.size < 3) fail('events', 'multi_scope_sources_required')

  const unitIds = new Set<string>()
  const unitSourceByNode = new Map<string, string>()
  arrayAt(fixture.units, 'units').forEach((raw, index) => {
    const path = `units.${index}`
    const unit = recordAt(raw, path)
    const id = uuidAt(unit.id, `${path}.id`)
    const node = nodesById.get(uuidAt(unit.nodeId, `${path}.nodeId`))
    const source = uuidAt(unit.sourceEventId, `${path}.sourceEventId`)
    if (!node || node.kind !== 'knowledge_unit' || node.authorityId !== id) fail(path, 'unit_authority_required')
    if (eventAudience.get(source) !== unit.audienceKey) fail(`${path}.audienceKey`, 'source_audience_must_match')
    stringAt(unit.claim, `${path}.claim`); stringAt(unit.extractorVersion, `${path}.extractorVersion`)
    stringAt(unit.claimKey, `${path}.claimKey`); unitIds.add(id); unitSourceByNode.set(String(unit.nodeId), source)
  })

  const exercised = new Set<string>(AUTHORITY_EDGE_KINDS)
  const edgeKeys: string[] = []
  const edgesById = new Map<string, { source: string; target: string; evidence: string[] }>()
  arrayAt(fixture.edges, 'edges').forEach((raw, index) => {
    const path = `edges.${index}`
    const edge = recordAt(raw, path)
    const id = uuidAt(edge.id, `${path}.id`)
    const source = uuidAt(edge.sourceNodeId, `${path}.sourceNodeId`)
    const target = uuidAt(edge.targetNodeId, `${path}.targetNodeId`)
    const kind = enumAt(edge.kind, GRAPH_EDGE_KINDS, `${path}.kind`)
    if (AUTHORITY_EDGE_KINDS.includes(kind as never)) fail(`${path}.kind`, 'authority_projection_only')
    if (!nodesById.has(source) || !nodesById.has(target)) fail(path, 'unknown_endpoint')
    if (canonicalEdgeEndpoints(kind, source, target).join() !== [source, target].join()) fail(path, 'noncanonical_direction')
    if (id !== canonicalGraphEdgeId(source, kind, target)) fail(`${path}.id`, 'not_canonical')
    const evidence = arrayAt(edge.evidenceEventIds, `${path}.evidenceEventIds`)
      .map((id, item) => uuidAt(id, `${path}.evidenceEventIds.${item}`))
    if (evidence.length === 0 || evidence.some((id) => !eventIds.has(id))) fail(path, 'evidence_required')
    const endpointSources = new Set([source, target].flatMap((nodeId) => {
      const node = nodesById.get(nodeId)
      if (node?.kind === 'message_event') return [String(node.authorityId)]
      if (node?.kind === 'knowledge_unit') return [unitSourceByNode.get(nodeId) ?? '']
      return []
    }))
    if (evidence.some((eventId) => !endpointSources.has(eventId))) fail(path, 'evidence_not_bound_to_endpoint')
    edgesById.set(id, { source, target, evidence })
    edgeKeys.push(`${source}:${kind}:${target}`); exercised.add(kind)
  })
  unique(edgeKeys, 'edges')
  if (GRAPH_EDGE_KINDS.some((kind) => !exercised.has(kind))) fail('edges', 'all_edge_kinds_required')

  const grantKeys: string[] = []
  arrayAt(fixture.grants, 'grants').forEach((raw, index) => {
    const path = `grants.${index}`
    const grant = recordAt(raw, path)
    const nodeId = uuidAt(grant.nodeId, `${path}.nodeId`)
    const basisKind = enumAt(grant.basisKind, GRAPH_GRANT_BASIS_KINDS, `${path}.basisKind`)
    if (!['source_event', 'edge_evidence'].includes(basisKind)
      || (basisKind === 'source_event' && grant.basisEventId !== undefined)) fail(path, 'fixture_basis_invalid')
    const basisId = uuidAt(grant.basisId, `${path}.basisId`)
    const eventId = basisKind === 'edge_evidence'
      ? uuidAt(grant.basisEventId, `${path}.basisEventId`) : basisId
    const key = stringAt(grant.audienceKey, `${path}.audienceKey`)
    const node = nodesById.get(nodeId)
    const edge = edgesById.get(basisId)
    const isContent = node?.kind === 'message_event' || node?.kind === 'knowledge_unit'
    const contentMatches = node?.kind === 'message_event' ? node.authorityId === eventId
      : node?.kind === 'knowledge_unit' && unitSourceByNode.get(nodeId) === eventId
    const evidenceMatches = edge && edge.evidence.includes(eventId)
      && (edge.source === nodeId || edge.target === nodeId)
    if (eventAudience.get(eventId) !== key || (basisKind === 'source_event'
      ? !contentMatches : isContent || !evidenceMatches)) fail(path, 'typed_basis_invalid')
    stringAt(grant.labelSnapshot, `${path}.labelSnapshot`)
    grantKeys.push(`${nodeId}:${key}:${basisKind}:${basisId}`)
  })
  unique(grantKeys, 'grants')

  arrayAt(fixture.renames, 'renames').forEach((raw, index) => {
    const rename = recordAt(raw, `renames.${index}`)
    if (!nodesById.has(uuidAt(rename.nodeId, `renames.${index}.nodeId`))) fail('renames', 'node_required')
    if (stringAt(rename.beforeLabel, 'renames.beforeLabel') === stringAt(rename.afterLabel, 'renames.afterLabel')) {
      fail('renames', 'stable_rename_required')
    }
  })
  const scenario = recordAt(fixture.authorityScenario, 'authorityScenario')
  Object.entries(scenario).forEach(([key, item]) => uuidAt(item, `authorityScenario.${key}`))
  const expected = recordAt(fixture.expected, 'expected')
  if (expected.nodeCount !== nodeIds.size || expected.historicalEdgeCount !== edgeKeys.length
    || expected.sourceAudienceCount !== audiences.length) fail('expected', 'canonical_counts_mismatch')
  const negative = recordAt(fixture.negativeSourceEvent, 'negativeSourceEvent')
  uuidAt(negative.id, 'negativeSourceEvent.id'); uuidAt(negative.attemptedNodeId, 'negativeSourceEvent.attemptedNodeId')
  stringAt(negative.content, 'negativeSourceEvent.content')
  return value as KnowledgeGraphFixture
}

export const knowledgeGraphFixture = validateKnowledgeGraphFixture(fixtureJson)
