import fixtureJson from './fixtures/v1.json'
import {
  GRAPH_EDGE_KINDS,
  GRAPH_NODE_KINDS,
  KNOWLEDGE_AUDIENCE_SCOPE_KINDS,
  canonicalEdgeEndpoints,
  canonicalGraphIdentity,
  type KnowledgeGraphFixture,
} from './contract'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const fail = (path: string, reason: string): never => {
  throw new Error(`knowledge_graph_fixture_invalid:${path}:${reason}`)
}

const recordAt = (value: unknown, path: string): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail(path, 'object_required')
  }
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
  if (!UUID_PATTERN.test(result)) return fail(path, 'uuid_required')
  return result
}

const enumAt = <T extends string>(value: unknown, allowed: readonly T[], path: string): T => {
  const result = stringAt(value, path)
  if (!allowed.includes(result as T)) return fail(path, 'unsupported_value')
  return result as T
}

const unique = (values: readonly string[], path: string): void => {
  if (new Set(values).size !== values.length) fail(path, 'duplicates_forbidden')
}

const stringArrayAt = (value: unknown, path: string): string[] => {
  const values = arrayAt(value, path).map((item, index) => stringAt(item, `${path}.${index}`))
  unique(values, path)
  return values
}

export const validateKnowledgeGraphFixture = (value: unknown): KnowledgeGraphFixture => {
  const fixture = recordAt(value, 'fixture')
  if (fixture.version !== 1) fail('version', 'must_equal_1')

  const viewers = recordAt(fixture.viewerProfileIds, 'viewerProfileIds')
  uuidAt(viewers.a, 'viewerProfileIds.a')
  uuidAt(viewers.b, 'viewerProfileIds.b')
  if (viewers.a === viewers.b) fail('viewerProfileIds', 'viewers_must_differ')

  const audiences = arrayAt(fixture.audiences, 'audiences')
  const audienceKeys = new Set<string>()
  audiences.forEach((rawAudience, index) => {
    const path = `audiences.${index}`
    const audience = recordAt(rawAudience, path)
    const key = stringAt(audience.key, `${path}.key`)
    if (audienceKeys.has(key)) fail(`${path}.key`, 'duplicate')
    audienceKeys.add(key)
    uuidAt(audience.id, `${path}.id`)
    enumAt(audience.scopeKind, KNOWLEDGE_AUDIENCE_SCOPE_KINDS, `${path}.scopeKind`)
    uuidAt(audience.scopeAuthorityId, `${path}.scopeAuthorityId`)
    const members = arrayAt(audience.memberProfileIds, `${path}.memberProfileIds`).map(
      (member, memberIndex) => uuidAt(member, `${path}.memberProfileIds.${memberIndex}`),
    )
    if (members.length === 0) fail(`${path}.memberProfileIds`, 'empty_audience_forbidden')
    unique(members, `${path}.memberProfileIds`)
    if ([...members].sort().join() !== members.join()) {
      fail(`${path}.memberProfileIds`, 'canonical_order_required')
    }
  })

  const nodes = arrayAt(fixture.nodes, 'nodes')
  const nodeIds = new Set<string>()
  const identities = new Set<string>()
  const nodesById = new Map<string, Record<string, unknown>>()
  const kindCounts = new Map<string, number>()
  nodes.forEach((rawNode, index) => {
    const path = `nodes.${index}`
    const node = recordAt(rawNode, path)
    const id = uuidAt(node.id, `${path}.id`)
    const kind = enumAt(node.kind, GRAPH_NODE_KINDS, `${path}.kind`)
    const authorityId = uuidAt(node.authorityId, `${path}.authorityId`)
    const identity = stringAt(node.identity, `${path}.identity`)
    if (identity !== canonicalGraphIdentity(kind, authorityId)) fail(`${path}.identity`, 'not_canonical')
    if (nodeIds.has(id) || identities.has(identity)) fail(path, 'duplicate_identity')
    nodeIds.add(id)
    identities.add(identity)
    nodesById.set(id, node)
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1)
    stringAt(node.label, `${path}.label`)
    if (!audienceKeys.has(stringAt(node.audienceKey, `${path}.audienceKey`))) {
      fail(`${path}.audienceKey`, 'unknown')
    }
  })
  if (GRAPH_NODE_KINDS.some((kind) => (kindCounts.get(kind) ?? 0) === 0)) {
    fail('nodes', 'all_six_kinds_required')
  }
  if (kindCounts.get('person') !== 2 || kindCounts.get('voyager') !== 2) {
    fail('nodes', 'two_people_and_voyagers_required')
  }

  const events = arrayAt(fixture.events, 'events')
  const eventIds = new Set<string>()
  events.forEach((rawEvent, index) => {
    const path = `events.${index}`
    const event = recordAt(rawEvent, path)
    const id = uuidAt(event.id, `${path}.id`)
    const nodeId = uuidAt(event.nodeId, `${path}.nodeId`)
    const node = nodesById.get(nodeId)
    if (!node) return fail(`${path}.nodeId`, 'message_event_required')
    if (node.kind !== 'message_event') fail(`${path}.nodeId`, 'message_event_required')
    if (node.authorityId !== id) fail(`${path}.id`, 'message_authority_must_equal_ledger_id')
    if (event.audienceKey !== node.audienceKey) fail(`${path}.audienceKey`, 'node_mismatch')
    stringAt(event.content, `${path}.content`)
    eventIds.add(id)
  })
  if (eventIds.size !== 2) fail('events', 'shared_and_private_events_required')

  const negativeEvent = recordAt(fixture.negativeSourceEvent, 'negativeSourceEvent')
  const negativeEventId = uuidAt(negativeEvent.id, 'negativeSourceEvent.id')
  uuidAt(negativeEvent.attemptedNodeId, 'negativeSourceEvent.attemptedNodeId')
  stringAt(negativeEvent.content, 'negativeSourceEvent.content')
  if (eventIds.has(negativeEventId)) fail('negativeSourceEvent.id', 'must_be_distinct')

  const units = arrayAt(fixture.units, 'units')
  const unitIds = new Set<string>()
  units.forEach((rawUnit, index) => {
    const path = `units.${index}`
    const unit = recordAt(rawUnit, path)
    const id = uuidAt(unit.id, `${path}.id`)
    const node = nodesById.get(uuidAt(unit.nodeId, `${path}.nodeId`))
    const sourceEventId = uuidAt(unit.sourceEventId, `${path}.sourceEventId`)
    const sourceEvent = events.find((event) => recordAt(event, path).id === sourceEventId) as
      | Record<string, unknown>
      | undefined
    if (!node) return fail(`${path}.nodeId`, 'knowledge_unit_required')
    if (node.kind !== 'knowledge_unit') fail(`${path}.nodeId`, 'knowledge_unit_required')
    if (node.authorityId !== id) fail(`${path}.id`, 'unit_authority_must_equal_unit_id')
    if (!eventIds.has(sourceEventId)) fail(`${path}.sourceEventId`, 'event_required')
    if (unit.audienceKey !== node.audienceKey || unit.audienceKey !== sourceEvent?.audienceKey) {
      fail(`${path}.audienceKey`, 'source_audience_must_match')
    }
    stringAt(unit.claim, `${path}.claim`)
    stringAt(unit.extractorVersion, `${path}.extractorVersion`)
    stringAt(unit.claimKey, `${path}.claimKey`)
    unitIds.add(id)
  })
  if (unitIds.size !== 2) fail('units', 'shared_and_private_units_required')

  const edgeKeys: string[] = []
  arrayAt(fixture.edges, 'edges').forEach((rawEdge, index) => {
    const path = `edges.${index}`
    const edge = recordAt(rawEdge, path)
    const source = uuidAt(edge.sourceNodeId, `${path}.sourceNodeId`)
    const target = uuidAt(edge.targetNodeId, `${path}.targetNodeId`)
    const kind = enumAt(edge.kind, GRAPH_EDGE_KINDS, `${path}.kind`)
    if (!nodesById.has(source) || !nodesById.has(target)) fail(path, 'unknown_endpoint')
    const [canonicalSource, canonicalTarget] = canonicalEdgeEndpoints(kind, source, target)
    if (source !== canonicalSource || target !== canonicalTarget) fail(path, 'noncanonical_direction')
    if (!audienceKeys.has(stringAt(edge.audienceKey, `${path}.audienceKey`))) {
      fail(`${path}.audienceKey`, 'unknown')
    }
    edgeKeys.push(`${source}:${kind}:${target}`)
  })
  unique(edgeKeys, 'edges')

  const renames = arrayAt(fixture.renames, 'renames')
  const renamedKinds = new Set<string>()
  renames.forEach((rawRename, index) => {
    const path = `renames.${index}`
    const rename = recordAt(rawRename, path)
    const node = nodesById.get(uuidAt(rename.nodeId, `${path}.nodeId`))
    if (!node) return fail(path, 'identity_kind_required')
    const nodeKind = enumAt(node.kind, ['person', 'voyager'] as const, `${path}.nodeKind`)
    const before = stringAt(rename.beforeLabel, `${path}.beforeLabel`)
    const after = stringAt(rename.afterLabel, `${path}.afterLabel`)
    if (before === after || after !== node.label) fail(path, 'stable_rename_required')
    renamedKinds.add(nodeKind)
  })
  if (renamedKinds.size !== 2) fail('renames', 'person_and_voyager_required')

  const expected = recordAt(fixture.expected, 'expected')
  if (expected.nodeCount !== nodes.length || expected.edgeCount !== edgeKeys.length) {
    fail('expected', 'canonical_counts_mismatch')
  }
  if (expected.audienceCount !== audiences.length) fail('expected.audienceCount', 'mismatch')
  for (const field of [
    'viewerAAllGraphIdentities',
    'viewerBAllGraphIdentities',
    'graphOffIdentities',
    'ownerBridgeIdentities',
    'victimBridgeIdentities',
    'rootDeniedIdentities',
  ] as const) {
    for (const identity of stringArrayAt(expected[field], `expected.${field}`)) {
      if (!identities.has(identity)) fail(`expected.${field}`, 'unknown_identity')
    }
  }
  for (const id of stringArrayAt(expected.privateNodeIds, 'expected.privateNodeIds')) {
    if (!nodeIds.has(id)) fail('expected.privateNodeIds', 'unknown_node')
  }
  uuidAt(expected.sharedUnitNodeId, 'expected.sharedUnitNodeId')
  uuidAt(expected.sharedSourceEventId, 'expected.sharedSourceEventId')
  stringAt(expected.sharedClaim, 'expected.sharedClaim')
  if (!audienceKeys.has(stringAt(expected.sharedAudienceKey, 'expected.sharedAudienceKey'))) {
    fail('expected.sharedAudienceKey', 'unknown')
  }

  return value as KnowledgeGraphFixture
}

export const knowledgeGraphFixture = validateKnowledgeGraphFixture(fixtureJson)
