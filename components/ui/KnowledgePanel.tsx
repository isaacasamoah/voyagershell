// TODO(opal): Side panel for inspecting a single graph node. Target craft:
//   - node content (preserved, never truncated in the detail view)
//   - attention score with a slider (captain-only) wired to PATCH
//     /api/knowledge/graph/edit { eventId, voyageSlug, attentionScore }
//   - context snippet as an editable textarea (captain-only) via the same
//     PATCH endpoint
//   - entities as chips; click → filter the graph view by entity
//   - "soft-delete" button → DELETE /api/knowledge/graph/edit?eventId=...
//   - "connect to…" mode → POST /api/knowledge/graph/edit { sourceId, targetId }
//   - non-captain members see the same view read-only
// Data contract: GraphNode + GraphEdge from lib/knowledge/graph.ts. This
// stub just lists the fields so the API surface is visible while Opal
// builds the real interaction.

'use client'

import { useState } from 'react'
import type { GraphNode } from '@/lib/knowledge/graph'

export interface KnowledgePanelProps {
  node: GraphNode
  isCaptain: boolean
  voyageSlug?: string
  onEdit?: (updated: GraphNode) => void
  onDelete?: (eventId: string) => void
  onCreateEdge?: (sourceId: string, targetId: string) => void
}

export const KnowledgePanel = ({
  node,
  isCaptain,
  voyageSlug,
  onEdit,
  onDelete,
}: KnowledgePanelProps) => {
  const [attention, setAttention] = useState(node.attentionScore)
  const [snippet, setSnippet] = useState(node.contextSnippet ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/knowledge/graph/edit', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: node.eventId,
          voyageSlug,
          attentionScore: attention,
          contextSnippet: snippet,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      onEdit?.({ ...node, attentionScore: attention, contextSnippet: snippet })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setSaving(true)
    setError(null)
    try {
      const params = new URLSearchParams({ eventId: node.eventId })
      if (voyageSlug) params.set('voyageSlug', voyageSlug)
      const res = await fetch(`/api/knowledge/graph/edit?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      onDelete?.(node.eventId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="text-xs font-mono p-4 text-slate-200 space-y-3 border border-slate-800 rounded">
      <div className="text-slate-400">
        node :: {node.eventId.slice(0, 8)}… · {node.knowledgeType ?? 'untyped'}
      </div>
      <div className="whitespace-pre-wrap">{node.content}</div>
      {node.entities.length > 0 && (
        <div className="text-slate-400">entities: {node.entities.join(', ')}</div>
      )}
      <div className="text-slate-400">
        attention: {node.attentionScore.toFixed(2)} · created {new Date(node.createdAt).toLocaleString()}
      </div>

      {isCaptain ? (
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <label className="block">
            <span className="text-slate-400">attention</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={attention}
              onChange={(e) => setAttention(parseFloat(e.target.value))}
              className="w-full"
              disabled={saving}
            />
            <span className="text-slate-500">{attention.toFixed(2)}</span>
          </label>
          <label className="block">
            <span className="text-slate-400">context snippet</span>
            <textarea
              value={snippet}
              onChange={(e) => setSnippet(e.target.value)}
              className="w-full bg-slate-900 text-slate-200 border border-slate-700 rounded p-1"
              rows={3}
              disabled={saving}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-2 py-1 border border-slate-700 rounded hover:bg-slate-800"
            >
              save
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="px-2 py-1 border border-red-900 rounded hover:bg-red-950 text-red-300"
            >
              soft-delete
            </button>
          </div>
          {error && <div className="text-red-400">{error}</div>}
        </div>
      ) : (
        <div className="text-slate-500 italic pt-2 border-t border-slate-800">
          read-only · captain-only editing
        </div>
      )}
    </div>
  )
}
