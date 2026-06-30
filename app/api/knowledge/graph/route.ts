import { NextResponse } from 'next/server'
import { requireAuthResponse } from '@/lib/auth'
import { getPinnedKnowledge, getConnectedKnowledge, type KnowledgeNode } from '@/lib/knowledge/search'

export async function GET() {
  const authResult = await requireAuthResponse()
  if (authResult instanceof Response) return authResult
  const userId = authResult

  const nodes = await getPinnedKnowledge(userId)
  const topNodes = nodes.slice(0, 10)
  const nodeIds = new Set(nodes.map((n) => n.eventId))

  const edgeArrays = await Promise.all(
    topNodes.map((n) => getConnectedKnowledge(n.eventId, userId))
  )

  // Relationships are bidirectional (lib/knowledge/events.ts writes connected_to
  // on both ends), so canonicalize each undirected edge by its sorted endpoint
  // pair — A-B and B-A collapse to one entry.
  const edgeSet = new Map<string, { from: string; to: string }>()
  topNodes.forEach((from, i) => {
    edgeArrays[i].forEach((connected: KnowledgeNode) => {
      if (!nodeIds.has(connected.eventId)) return
      if (from.eventId === connected.eventId) return
      const [a, b] = [from.eventId, connected.eventId].sort()
      const key = `${a}--${b}`
      if (!edgeSet.has(key)) {
        edgeSet.set(key, { from: a, to: b })
      }
    })
  })

  return NextResponse.json({ nodes, edges: Array.from(edgeSet.values()) })
}
