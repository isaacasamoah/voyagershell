// Slice 4B: Graph editing API (captain-only)
//
// Three verbs share the same auth pattern:
//
//   PATCH  /api/knowledge/graph/edit
//     body: { eventId, voyageSlug?, attentionScore?, contextSnippet? }
//     → manualAdjust()  (captain or owner, per scope)
//
//   DELETE /api/knowledge/graph/edit?eventId=...&voyageSlug=...
//     → softDeleteNode() (attention_score → 0)
//
//   POST   /api/knowledge/graph/edit
//     body: { sourceId, targetId, voyageSlug? }
//     → createManualEdge() (records captain user_id in created_by)
//
// For voyage-scoped requests we call isCaptain() before mutating. For
// personal-scoped requests manualAdjust/softDeleteNode verify the node
// belongs to the caller; POST in personal scope falls back to "both
// endpoints must live in caller's personal knowledge".

import { NextResponse } from 'next/server'
import { requireAuthResponse } from '@/lib/auth'
import { isCaptain } from '@/lib/voyage'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  manualAdjust,
  softDeleteNode,
} from '@/lib/knowledge/curator'
import { createManualEdge } from '@/lib/knowledge/edges'

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Verify the actor can create an edge between two nodes.
 *
 * Voyage scope → caller must be captain of that voyage AND both endpoints
 * must live in that voyage (prevents cross-voyage bridges).
 *
 * Personal scope → both endpoints must be owned by the caller in their
 * personal space (voyage_slug IS NULL, user_id = caller).
 */
const authoriseEdgeCreation = async (
  sourceId: string,
  targetId: string,
  userId: string,
  voyageSlug: string | undefined,
): Promise<
  | { ok: true }
  | { ok: false; status: number; error: string }
> => {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('knowledge_current')
    .select('event_id, user_id, voyage_slug')
    .in('event_id', [sourceId, targetId])

  if (error) {
    return { ok: false, status: 500, error: `Lookup failed: ${error.message}` }
  }
  const rows = (data ?? []) as Array<{
    event_id: string
    user_id: string | null
    voyage_slug: string | null
  }>
  if (rows.length !== 2) {
    return { ok: false, status: 404, error: 'One or both nodes not found' }
  }

  if (voyageSlug) {
    const allInVoyage = rows.every((r) => r.voyage_slug === voyageSlug)
    if (!allInVoyage) {
      return { ok: false, status: 403, error: 'Both nodes must belong to the voyage' }
    }
    const captain = await isCaptain(voyageSlug, userId)
    if (!captain) {
      return { ok: false, status: 403, error: 'Captain-only action' }
    }
    return { ok: true }
  }

  // Personal scope: caller owns both
  const allMine = rows.every((r) => r.user_id === userId && r.voyage_slug === null)
  if (!allMine) {
    return { ok: false, status: 403, error: 'You do not own both nodes' }
  }
  return { ok: true }
}

// -----------------------------------------------------------------------------
// PATCH — adjust attention / snippet
// -----------------------------------------------------------------------------

export const PATCH = async (req: Request): Promise<Response> => {
  const authResult = await requireAuthResponse()
  if (authResult instanceof Response) return authResult
  const userId = authResult

  let body: {
    eventId?: string
    voyageSlug?: string
    attentionScore?: number
    contextSnippet?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.eventId || typeof body.eventId !== 'string') {
    return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
  }

  const result = await manualAdjust({
    eventId: body.eventId,
    userId,
    voyageSlug: body.voyageSlug,
    updates: {
      attentionScore: body.attentionScore,
      contextSnippet: body.contextSnippet,
    },
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, row: result.row })
}

// -----------------------------------------------------------------------------
// DELETE — soft-delete via attention → 0
// -----------------------------------------------------------------------------

export const DELETE = async (req: Request): Promise<Response> => {
  const authResult = await requireAuthResponse()
  if (authResult instanceof Response) return authResult
  const userId = authResult

  const url = new URL(req.url)
  const eventId = url.searchParams.get('eventId')
  const voyageSlug = url.searchParams.get('voyageSlug') ?? undefined

  if (!eventId) {
    return NextResponse.json({ error: 'eventId query param is required' }, { status: 400 })
  }

  const result = await softDeleteNode({ eventId, userId, voyageSlug })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, row: result.row })
}

// -----------------------------------------------------------------------------
// POST — create a manual edge
// -----------------------------------------------------------------------------

export const POST = async (req: Request): Promise<Response> => {
  const authResult = await requireAuthResponse()
  if (authResult instanceof Response) return authResult
  const userId = authResult

  let body: {
    sourceId?: string
    targetId?: string
    voyageSlug?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.sourceId || !body.targetId) {
    return NextResponse.json(
      { error: 'sourceId and targetId are required' },
      { status: 400 },
    )
  }
  if (body.sourceId === body.targetId) {
    return NextResponse.json({ error: 'sourceId and targetId must differ' }, { status: 400 })
  }

  const authz = await authoriseEdgeCreation(
    body.sourceId,
    body.targetId,
    userId,
    body.voyageSlug,
  )
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status })
  }

  const edge = await createManualEdge({
    sourceId: body.sourceId,
    targetId: body.targetId,
    createdByUserId: userId,
  })

  // createManualEdge returns null when the edge already exists (idempotent);
  // surface that as ok: true with edge: null rather than as an error.
  return NextResponse.json({ ok: true, edge })
}
