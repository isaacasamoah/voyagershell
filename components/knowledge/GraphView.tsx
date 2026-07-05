'use client'
import React, { useEffect, useState } from 'react'
import type { KnowledgeNode } from '@/lib/knowledge/search'
import { GraphNode } from './GraphNode'

export function GraphView() {
  const [nodes, setNodes] = useState<KnowledgeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/knowledge/graph')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load')
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        setNodes(data.nodes ?? [])
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const sorted = [...nodes].sort((a, b) => (b.attentionScore ?? 0) - (a.attentionScore ?? 0))

  return (
    <div data-testid="graph-panel" className="h-full flex flex-col">
      <h3 className="text-sm font-medium text-gray-300 px-4 pt-3 pb-2">Knowledge Graph</h3>
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border border-white/10 rounded-lg p-3 bg-white/5 animate-pulse h-16" />
          ))}
        {!loading && error && <p className="text-sm text-red-400">{error}</p>}
        {!loading && !error && sorted.length === 0 && (
          <p className="text-sm text-gray-500 text-center pt-8">No knowledge yet</p>
        )}
        {!loading && !error && sorted.map((node) => <GraphNode key={node.eventId} node={node} />)}
      </div>
    </div>
  )
}
