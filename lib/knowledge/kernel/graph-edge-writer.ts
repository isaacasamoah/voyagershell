import { getAdminClient } from '@/lib/supabase/admin'
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

type GraphEdgeRpc = (
  name: 'write_knowledge_graph_edge',
  args: {
    p_source_kind: GraphNodeKind
    p_source_authority_id: string
    p_target_kind: GraphNodeKind
    p_target_authority_id: string
    p_kind: GraphEdgeKind
  },
) => Promise<{ error: { message: string } | null }>

/**
 * Write one edge by canonical graph identity through the service-only RPC.
 * Endpoint resolution, audience derivation, and idempotency stay inside the
 * database boundary.
 */
export const writeKnowledgeGraphEdge = async (
  edge: KnowledgeGraphEdgeWrite,
): Promise<void> => {
  const serviceClient = getAdminClient() as unknown as { rpc: GraphEdgeRpc }
  const { error } = await serviceClient.rpc('write_knowledge_graph_edge', {
    p_source_kind: edge.source.kind,
    p_source_authority_id: edge.source.authorityId,
    p_target_kind: edge.target.kind,
    p_target_authority_id: edge.target.authorityId,
    p_kind: edge.kind,
  })

  if (error) throw new Error(`knowledge_graph_edge_write_failed:${error.message}`)
}
