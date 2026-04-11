// Slice 4A: Graph data contract
//
// getGraphData() is the single read path that powers the knowledge graph
// visualisation. It runs a filtered query over knowledge_current and joins
// the result set back to knowledge_edges so the UI only ever sees edges
// whose endpoints are both present in the node set (no dangling stubs).
//
// Privacy: mirrors the 4-layer pattern from lib/knowledge/search.ts via
// buildScopeFilter(). Personal-scope queries are owner-only. Voyage-scope
// queries let every member see voyage content according to the same
// layer rules used by curatePromptWindow / searchKnowledge.
//
// Pagination: cursor encodes { created_at, id } as base64 JSON so pages
// stay stable under concurrent writes. Ordering is DESC on
// source_created_at, then event_id as the tiebreaker.

import { getAdminClient } from '@/lib/supabase/admin'
import { buildScopeFilter } from './search'
import type { EdgeType } from './edges'

// =============================================================================
// Types
// =============================================================================

export type GraphScope = 'personal' | 'voyage'

export interface GraphNode {
  eventId: string
  content: string
  knowledgeType: string | null
  attentionScore: number
  contextSnippet: string | null
  entities: string[]
  topics: string[]
  classifications: string[]
  eventType: string | null
  senderDisplayName: string | null
  senderUserId: string | null
  createdAt: string // ISO — the UI lives in the browser, let it parse
}

export interface GraphEdge {
  id: string
  sourceId: string
  targetId: string
  edgeType: EdgeType
  createdBy: string
  createdAt: string
}

export interface GraphCursor {
  createdAt: string
  id: string
}

export interface GraphQueryParams {
  scope: GraphScope
  userId: string
  voyageSlug?: string
  knowledgeType?: string
  minAttention?: number
  since?: string // ISO timestamp
  entity?: string
  q?: string
  limit?: number
  cursor?: string // base64-encoded GraphCursor
}

export interface GraphPayload {
  nodes: GraphNode[]
  edges: GraphEdge[]
  nextCursor?: string
}

// =============================================================================
// Cursor helpers
// =============================================================================

export const encodeCursor = (cursor: GraphCursor): string =>
  Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64')

export const decodeCursor = (raw: string): GraphCursor | null => {
  try {
    const json = Buffer.from(raw, 'base64').toString('utf8')
    const parsed = JSON.parse(json) as Partial<GraphCursor>
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null
    return { createdAt: parsed.createdAt, id: parsed.id }
  } catch {
    return null
  }
}

// =============================================================================
// Row shape from knowledge_current (the columns we select)
// =============================================================================

interface GraphRow {
  event_id: string
  content: string | null
  knowledge_type: string | null
  attention_score: number | null
  context_snippet: string | null
  entities: string[] | null
  topics: string[] | null
  classifications: string[] | null
  event_type: string | null
  sender_display_name: string | null
  sender_user_id: string | null
  source_created_at: string
  user_id: string | null
  voyage_slug: string | null
}

const toGraphNode = (row: GraphRow): GraphNode => ({
  eventId: row.event_id,
  content: row.content ?? '',
  knowledgeType: row.knowledge_type,
  attentionScore: row.attention_score ?? 0,
  contextSnippet: row.context_snippet,
  entities: row.entities ?? [],
  topics: row.topics ?? [],
  classifications: row.classifications ?? [],
  eventType: row.event_type,
  senderDisplayName: row.sender_display_name,
  senderUserId: row.sender_user_id,
  createdAt: row.source_created_at,
})

// =============================================================================
// Main query
// =============================================================================

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

/**
 * Fetch a privacy-scoped knowledge subgraph.
 *
 * One PostgREST query for nodes (filtered knowledge_current), then a
 * second query for edges whose source AND target are both in the
 * returned node set. We use the admin client with explicit privacy
 * filters rather than the per-request session client so this function
 * stays callable from server-only contexts (cron, enrichment, etc).
 * See lib/knowledge/search.ts for the canonical filter pattern.
 */
export const getGraphData = async (params: GraphQueryParams): Promise<GraphPayload> => {
  const {
    scope,
    userId,
    voyageSlug,
    knowledgeType,
    minAttention = 0,
    since,
    entity,
    q,
    limit = DEFAULT_LIMIT,
    cursor,
  } = params

  const cappedLimit = Math.max(1, Math.min(MAX_LIMIT, limit))

  const supabase = getAdminClient()

  // ---- Node query ---------------------------------------------------------
  let query = supabase
    .from('knowledge_current')
    .select(
      'event_id, content, knowledge_type, attention_score, context_snippet, entities, topics, classifications, event_type, sender_display_name, sender_user_id, source_created_at, user_id, voyage_slug',
    )

  // Privacy layer — same 4-layer pattern as search.ts
  if (scope === 'voyage') {
    if (!voyageSlug) {
      // voyage scope requires a slug; return empty rather than leaking
      return { nodes: [], edges: [] }
    }
    query = query.or(buildScopeFilter(userId, voyageSlug))
  } else {
    // personal: owner-only, strictly outside any voyage
    query = query.eq('user_id', userId).is('voyage_slug', null)
  }

  // Attention floor
  if (minAttention > 0) {
    query = query.gte('attention_score', minAttention)
  }

  // Knowledge type filter
  if (knowledgeType) {
    query = query.eq('knowledge_type', knowledgeType)
  }

  // Entity filter — entities is a text[] column; `cs` = contains
  if (entity && entity.trim().length > 0) {
    query = query.contains('entities', [entity.trim()])
  }

  // Time window
  if (since) {
    query = query.gte('source_created_at', since)
  }

  // Text search — cheap ILIKE over content. The knowledge graph is
  // inherently visual; vector search belongs in the /api/knowledge/search
  // path, not here.
  if (q && q.trim().length > 0) {
    const pattern = `%${q.trim()}%`
    query = query.ilike('content', pattern)
  }

  // Stable pagination: order by (source_created_at DESC, event_id DESC)
  // and use keyset cursor. Decode the cursor defensively.
  if (cursor) {
    const decoded = decodeCursor(cursor)
    if (decoded) {
      // (created_at, id) < (cursor.created_at, cursor.id)
      query = query.or(
        `source_created_at.lt.${decoded.createdAt},and(source_created_at.eq.${decoded.createdAt},event_id.lt.${decoded.id})`,
      )
    }
  }

  query = query
    .order('source_created_at', { ascending: false })
    .order('event_id', { ascending: false })
    .limit(cappedLimit + 1) // +1 to detect hasMore

  const { data: rawRows, error } = await query
  if (error) {
    console.error('[graph] node query failed', error)
    return { nodes: [], edges: [] }
  }

  const rows = (rawRows ?? []) as GraphRow[]

  // Slice down to cappedLimit and compute the next cursor off the slice edge
  const hasMore = rows.length > cappedLimit
  const sliced = hasMore ? rows.slice(0, cappedLimit) : rows
  const nodes = sliced.map(toGraphNode)

  let nextCursor: string | undefined
  if (hasMore && sliced.length > 0) {
    const last = sliced[sliced.length - 1]
    nextCursor = encodeCursor({
      createdAt: last.source_created_at,
      id: last.event_id,
    })
  }

  // ---- Edge query (scoped to the node set) --------------------------------
  let edges: GraphEdge[] = []
  if (nodes.length > 0) {
    const nodeIds = nodes.map((n) => n.eventId)

    // knowledge_edges is not in generated Supabase types — cast through any
    const edgesTable = (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from(
      'knowledge_edges',
    )

    const { data: edgeRows, error: edgeErr } = await edgesTable
      .select('id, source_id, target_id, edge_type, created_by, created_at')
      .in('source_id', nodeIds)
      .in('target_id', nodeIds)
      .limit(2000)

    if (edgeErr) {
      console.error('[graph] edge query failed', edgeErr)
    } else if (edgeRows) {
      edges = (edgeRows as Array<Record<string, unknown>>).map((row) => ({
        id: row.id as string,
        sourceId: row.source_id as string,
        targetId: row.target_id as string,
        edgeType: row.edge_type as EdgeType,
        createdBy: row.created_by as string,
        createdAt: row.created_at as string,
      }))
    }
  }

  return { nodes, edges, nextCursor }
}
