// Slice 4A: Graph data API
//
// GET /api/knowledge/graph
//   ?scope=personal|voyage
//   &voyageSlug=...            (required when scope=voyage)
//   &knowledgeType=...         (domain | operational | preference)
//   &minAttention=0.3          (float in [0, 1])
//   &since=2026-01-01T00:00:00Z
//   &entity=alice
//   &q=free text
//   &limit=100                 (default 100, hard cap 500)
//   &cursor=<opaque>           (from a previous response's nextCursor)
//
// Auth: requireAuthResponse. For scope=voyage the caller must be a member
// of the voyage (not necessarily captain — captain is only required for
// the mutating edit route). Personal scope is owner-only and enforced
// inside getGraphData() via the 4-layer privacy filter.
//
// Returns: { nodes: GraphNode[], edges: GraphEdge[], nextCursor?: string }

import { NextResponse } from 'next/server'
import { requireAuthResponse } from '@/lib/auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { getGraphData, type GraphScope } from '@/lib/knowledge/graph'

const parseFloatParam = (raw: string | null): number | undefined => {
  if (raw === null) return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

const parseIntParam = (raw: string | null): number | undefined => {
  if (raw === null) return undefined
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Voyage membership check — any role (captain, officer, crew).
 * We do this inline rather than pulling in isCaptain because the read
 * path is open to every member; captain-only gating is reserved for the
 * /api/knowledge/graph/edit path.
 */
const isVoyageMember = async (voyageSlug: string, userId: string): Promise<boolean> => {
  const supabase = getAdminClient()
  const { data: voyage, error: voyageError } = await supabase
    .from('voyages')
    .select('id')
    .eq('slug', voyageSlug)
    .maybeSingle()

  if (voyageError || !voyage) return false

  const { data: member, error: memberError } = await supabase
    .from('voyage_members')
    .select('id')
    .eq('voyage_id', (voyage as { id: string }).id)
    .eq('user_id', userId)
    .maybeSingle()

  if (memberError) return false
  return !!member
}

export const GET = async (req: Request): Promise<Response> => {
  const authResult = await requireAuthResponse()
  if (authResult instanceof Response) return authResult
  const userId = authResult

  const url = new URL(req.url)
  const scopeRaw = url.searchParams.get('scope') ?? 'personal'
  const scope: GraphScope = scopeRaw === 'voyage' ? 'voyage' : 'personal'

  const voyageSlug = url.searchParams.get('voyageSlug') ?? undefined
  const knowledgeType = url.searchParams.get('knowledgeType') ?? undefined
  const minAttention = parseFloatParam(url.searchParams.get('minAttention'))
  const since = url.searchParams.get('since') ?? undefined
  const entity = url.searchParams.get('entity') ?? undefined
  const q = url.searchParams.get('q') ?? undefined
  const limit = parseIntParam(url.searchParams.get('limit'))
  const cursor = url.searchParams.get('cursor') ?? undefined

  if (scope === 'voyage') {
    if (!voyageSlug) {
      return NextResponse.json(
        { error: 'voyageSlug is required when scope=voyage' },
        { status: 400 },
      )
    }
    const allowed = await isVoyageMember(voyageSlug, userId)
    if (!allowed) {
      return NextResponse.json(
        { error: 'You are not a member of this voyage' },
        { status: 403 },
      )
    }
  }

  const payload = await getGraphData({
    scope,
    userId,
    voyageSlug,
    knowledgeType,
    minAttention,
    since,
    entity,
    q,
    limit,
    cursor,
  })

  return NextResponse.json(payload)
}
