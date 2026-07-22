export const GRAPH_NODE_KINDS = [
  'person',
  'voyager',
  'voyage',
  'space',
  'message_event',
  'knowledge_unit',
] as const

export const GRAPH_EDGE_KINDS = [
  'authored_by',
  'posted_in',
  'reply_to',
  'in_voyage',
  'member_of',
  'companion_of',
  'derived_from',
  'generated_by',
  'about',
  'supports',
  'contradicts',
  'supersedes',
  'elaborates',
  'relates_to',
  'decided_by',
  'raised_by',
] as const

export const KNOWLEDGE_AUDIENCE_SCOPE_KINDS = ['voyage', 'space', 'private'] as const

export type GraphNodeKind = (typeof GRAPH_NODE_KINDS)[number]
export type GraphEdgeKind = (typeof GRAPH_EDGE_KINDS)[number]
export type KnowledgeAudienceScopeKind = (typeof KNOWLEDGE_AUDIENCE_SCOPE_KINDS)[number]

export const canonicalGraphIdentity = (kind: GraphNodeKind, authorityId: string): string => {
  const normalizedId = authorityId.trim().toLowerCase()
  if (normalizedId.length === 0) throw new Error('authority_id_required')
  return `${kind}:${normalizedId}`
}

export const canonicalEdgeEndpoints = (
  kind: GraphEdgeKind,
  sourceNodeId: string,
  targetNodeId: string,
): readonly [string, string] => {
  if (sourceNodeId === targetNodeId) throw new Error('self_edge_forbidden')
  if (kind !== 'relates_to' || sourceNodeId < targetNodeId) return [sourceNodeId, targetNodeId]
  return [targetNodeId, sourceNodeId]
}

export interface KnowledgeAudienceFixture {
  readonly key: string
  readonly id: string
  readonly scopeKind: KnowledgeAudienceScopeKind
  readonly scopeAuthorityId: string
  readonly memberProfileIds: readonly string[]
}

export interface GraphNodeFixture {
  readonly id: string
  readonly kind: GraphNodeKind
  readonly authorityId: string
  readonly identity: string
  readonly label: string
  readonly audienceKey: string
}

export interface KnowledgeEventFixture {
  readonly id: string
  readonly nodeId: string
  readonly content: string
  readonly audienceKey: string
}

export interface NegativeKnowledgeEventFixture {
  readonly id: string
  readonly attemptedNodeId: string
  readonly content: string
}

export interface KnowledgeUnitFixture {
  readonly id: string
  readonly nodeId: string
  readonly claim: string
  readonly sourceEventId: string
  readonly extractorVersion: string
  readonly claimKey: string
  readonly audienceKey: string
}

export interface GraphEdgeFixture {
  readonly sourceNodeId: string
  readonly targetNodeId: string
  readonly kind: GraphEdgeKind
  readonly audienceKey: string
}

export interface GraphRenameFixture {
  readonly nodeId: string
  readonly beforeLabel: string
  readonly afterLabel: string
}

export interface KnowledgeGraphExpectedFixture {
  readonly nodeCount: number
  readonly edgeCount: number
  readonly audienceCount: number
  readonly viewerAAllGraphIdentities: readonly string[]
  readonly viewerBAllGraphIdentities: readonly string[]
  readonly graphOffIdentities: readonly string[]
  readonly ownerBridgeIdentities: readonly string[]
  readonly victimBridgeIdentities: readonly string[]
  readonly rootDeniedIdentities: readonly string[]
  readonly privateNodeIds: readonly string[]
  readonly sharedUnitNodeId: string
  readonly sharedClaim: string
  readonly sharedSourceEventId: string
  readonly sharedAudienceKey: string
}

export interface KnowledgeGraphFixture {
  readonly version: number
  readonly viewerProfileIds: { readonly a: string; readonly b: string }
  readonly audiences: readonly KnowledgeAudienceFixture[]
  readonly nodes: readonly GraphNodeFixture[]
  readonly events: readonly KnowledgeEventFixture[]
  readonly negativeSourceEvent: NegativeKnowledgeEventFixture
  readonly units: readonly KnowledgeUnitFixture[]
  readonly edges: readonly GraphEdgeFixture[]
  readonly renames: readonly GraphRenameFixture[]
  readonly expected: KnowledgeGraphExpectedFixture
}
