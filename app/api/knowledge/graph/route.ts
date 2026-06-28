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

  const edgeSet = new Map<string, { from: string; to: string }>()
  topNodes.forEach((from, i) => {
    edgeArrays[i].forEach((connected: KnowledgeNode) => {
      if (!nodeIds.has(connected.eventId)) return
      const key = `${from.eventId}->${connected.eventId}`
      if (!edgeSet.has(key)) {
        edgeSet.set(key, { from: from.eventId, to: connected.eventId })
      }
    })
  })

  return NextResponse.json({ nodes, edges: Array.from(edgeSet.values()) })
}
