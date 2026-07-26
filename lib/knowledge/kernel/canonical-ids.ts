import { createHash } from 'node:crypto'
import {
  canonicalEdgeEndpoints,
  type GraphEdgeKind,
  type GraphNodeKind,
  type KnowledgeAudiencePurpose,
  type KnowledgeAudienceScopeKind,
} from './contract'

const md5Uuid = (value: string): string => {
  const digest = createHash('md5').update(value).digest('hex')
  return [digest.slice(0, 8), digest.slice(8, 12), digest.slice(12, 16),
    digest.slice(16, 20), digest.slice(20)].join('-')
}

export const canonicalGraphNodeId = (kind: GraphNodeKind, authorityId: string): string =>
  md5Uuid(`voyager-node:v2:${kind}:${authorityId}`)

export const canonicalKnowledgeAudienceId = (
  purpose: KnowledgeAudiencePurpose,
  scope: KnowledgeAudienceScopeKind,
  authorityId: string,
  members: readonly string[],
): string => md5Uuid(`voyager-audience:v2:${purpose}:${scope}:${authorityId}:${Array
  .from(new Set(members)).sort().join(',')}`)

export const canonicalSpaceMemberId = (spaceId: string, userId: string): string =>
  md5Uuid(`voyager-space-member:v1:${spaceId}:${userId}`)

export const canonicalGraphEdgeId = (
  sourceNodeId: string,
  kind: GraphEdgeKind,
  targetNodeId: string,
): string => {
  const [source, target] = canonicalEdgeEndpoints(kind, sourceNodeId, targetNodeId)
  return md5Uuid(`voyager-edge:v2:${source}:${kind}:${target}`)
}
