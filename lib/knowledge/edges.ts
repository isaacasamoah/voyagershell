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

// knowledge_edges is not in generated Supabase types yet — cast through any
const edgesTable = () => (getAdminClient() as any).from('knowledge_edges')

// =============================================================================
// Edge Operations
// =============================================================================

export interface KnowledgeEdge {
  id: string
  source_id: string
  target_id: string
  edge_type: EdgeType
  created_by: string
  created_at: string
}

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

