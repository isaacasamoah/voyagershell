import { getKnowledgeGraphCandidateClient } from './candidate-client'
import type { GraphEdgeKind, GraphNodeKind } from './contract'

export interface GraphNodeReference {
  readonly kind: GraphNodeKind
  readonly authorityId: string
}

export interface KnowledgeGraphEdgeWrite {
  readonly source: GraphNodeReference
  readonly target: GraphNodeReference
  readonly kind: GraphEdgeKind
}

/**
 * Write one edge by canonical graph identity through the service-only RPC.
 * Endpoint resolution, exact source-evidence derivation, and idempotency stay
 * inside the database boundary. Authority edges are trigger-only.
 */
export const writeKnowledgeGraphEdge = async (
  edge: KnowledgeGraphEdgeWrite,
): Promise<void> => {
  const serviceClient = getKnowledgeGraphCandidateClient()
  const { error } = await serviceClient.rpc('write_knowledge_graph_edge', {
    p_source_kind: edge.source.kind,
    p_source_authority_id: edge.source.authorityId,
    p_target_kind: edge.target.kind,
    p_target_authority_id: edge.target.authorityId,
    p_kind: edge.kind,
  })

  if (error) throw new Error(`knowledge_graph_edge_write_failed:${error.message}`)
}
