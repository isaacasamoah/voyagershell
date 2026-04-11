// TODO(opal): Interactive force-directed D3 visualization — color/size nodes by
// knowledge_type and attention_score, render directional edges with arrowheads
// styled per edge_type (supersedes/contradicts vs. manual captain overlays).
// Click node → open KnowledgePanel. Captain sees edit controls wired to the
// edit API at /api/knowledge/graph/edit. Data contract lives in
// lib/knowledge/graph.ts — see GraphPayload / GraphNode / GraphEdge. Slice 4
// ships only this stub so the data layer is honest about what the UI reads.

'use client'

import { useEffect, useState } from 'react'
import type { GraphPayload, GraphScope } from '@/lib/knowledge/graph'

export interface KnowledgeGraphProps {
  scope: GraphScope
  voyageSlug?: string
}

export const KnowledgeGraph = ({ scope, voyageSlug }: KnowledgeGraphProps) => {
  const [payload, setPayload] = useState<GraphPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const params = new URLSearchParams({ scope })
    if (scope === 'voyage' && voyageSlug) {
      params.set('voyageSlug', voyageSlug)
    }

    fetch(`/api/knowledge/graph?${params.toString()}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<GraphPayload>
      })
      .then((data) => {
        if (cancelled) return
        setPayload(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [scope, voyageSlug])

  if (loading) {
    return (
      <pre className="text-xs text-slate-400 font-mono p-4">
        $ loading knowledge graph ({scope}
        {voyageSlug ? ` — ${voyageSlug}` : ''})…
      </pre>
    )
  }

  if (error) {
    return (
      <pre className="text-xs text-red-400 font-mono p-4">
        graph error: {error}
      </pre>
    )
  }

  if (!payload) {
    return (
      <pre className="text-xs text-slate-400 font-mono p-4">
        no graph data
      </pre>
    )
  }

  const { nodes, edges, nextCursor } = payload
  const preview = nodes.slice(0, 5)

  return (
    <pre className="text-xs text-slate-200 font-mono p-4 whitespace-pre-wrap">
      {`knowledge-graph :: scope=${scope}${voyageSlug ? ` voyage=${voyageSlug}` : ''}
nodes: ${nodes.length}
edges: ${edges.length}
nextCursor: ${nextCursor ?? '—'}

first ${preview.length} node(s):
${preview
  .map((n, i) => {
    const snippet = (n.contextSnippet ?? n.content ?? '').slice(0, 80)
    return `  ${i + 1}. [${n.knowledgeType ?? 'untyped'} · attn ${n.attentionScore.toFixed(2)}] ${snippet}`
  })
  .join('\n')}
`}
    </pre>
  )
}
