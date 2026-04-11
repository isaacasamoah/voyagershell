// Typed Directional Edges
// Knowledge v2 Feature 3: Graph edges with semantic types
//
// 8 edge types encode the *relationship* between knowledge nodes,
// not just that they're connected. Direction matters.

import { getAdminClient } from '@/lib/supabase/admin'

// =============================================================================
// Types
// =============================================================================

export type EdgeType =
  | 'supersedes'    // new -> old: replaces stale knowledge
  | 'supports'      // evidence -> claim: evidence chain
  | 'contradicts'   // claim -> claim: tension
  | 'elaborates'    // detail -> summary: deepens understanding
  | 'triggered_by'  // effect -> cause: causality
  | 'relates_to'    // concept <-> concept: lateral connection (HIGH BAR)
  | 'decided_by'    // decision -> person: accountability
  | 'raised_by'     // concern/idea -> person: attribution
  | 'manual'        // captain-authored edge (Slice 4B) — see migration 035

export interface KnowledgeEdge {
  id: string
  source_id: string
  target_id: string
  edge_type: EdgeType
  created_by: string
  created_at: string
}

// knowledge_edges is not in generated Supabase types yet — cast through any
const edgesTable = () => (getAdminClient() as any).from('knowledge_edges')

// =============================================================================
// Edge Operations
// =============================================================================

/**
 * Create a typed directional edge between two knowledge nodes.
 * Idempotent — ON CONFLICT DO NOTHING for (source_id, target_id, edge_type).
 */
export const createEdge = async (
  sourceId: string,
  targetId: string,
  edgeType: EdgeType,
  createdBy: string = 'cartographer'
): Promise<KnowledgeEdge | null> => {
  const { data, error } = await edgesTable()
    .upsert(
      {
        source_id: sourceId,
        target_id: targetId,
        edge_type: edgeType,
        created_by: createdBy,
      },
      { onConflict: 'source_id,target_id,edge_type', ignoreDuplicates: true }
    )
    .select()
    .single()

  if (error) {
    // ignoreDuplicates returns no rows on conflict — not a real error
    if (error.code === 'PGRST116') return null
    console.error('[edges] createEdge error:', error)
    return null
  }

  return data as KnowledgeEdge
}

/**
 * Create a captain-authored manual edge (Slice 4B).
 *
 * Semantically identical to createEdge() but hard-codes edge_type='manual'
 * and records the captain's user_id in created_by (a TEXT column; we pass
 * the UUID as a string rather than the literal 'cartographer').
 *
 * Idempotent via the same UNIQUE (source_id, target_id, edge_type) constraint.
 */
export const createManualEdge = async ({
  sourceId,
  targetId,
  createdByUserId,
}: {
  sourceId: string
  targetId: string
  createdByUserId: string
}): Promise<KnowledgeEdge | null> => {
  return createEdge(sourceId, targetId, 'manual', createdByUserId)
}

/**
 * Get outgoing edges from a node.
 * Optional type filter and limit.
 */
export const getEdgesFrom = async (
  nodeId: string,
  edgeType?: EdgeType,
  limit: number = 50
): Promise<KnowledgeEdge[]> => {
  let query = edgesTable()
    .select('*')
    .eq('source_id', nodeId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (edgeType) {
    query = query.eq('edge_type', edgeType)
  }

  const { data, error } = await query

  if (error) {
    console.error('[edges] getEdgesFrom error:', error)
    return []
  }

  return (data ?? []) as KnowledgeEdge[]
}

/**
 * Get incoming edges to a node.
 * Optional type filter and limit.
 */
export const getEdgesTo = async (
  nodeId: string,
  edgeType?: EdgeType,
  limit: number = 50
): Promise<KnowledgeEdge[]> => {
  let query = edgesTable()
    .select('*')
    .eq('target_id', nodeId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (edgeType) {
    query = query.eq('edge_type', edgeType)
  }

  const { data, error } = await query

  if (error) {
    console.error('[edges] getEdgesTo error:', error)
    return []
  }

  return (data ?? []) as KnowledgeEdge[]
}
