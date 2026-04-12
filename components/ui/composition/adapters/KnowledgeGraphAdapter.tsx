// KnowledgeGraphAdapter - Placeholder for knowledge graph visualisation
// Renders a text-based summary of nodes and edges.
// This is the seam where Opal's D3 force graph drops in later.

'use client'

import { Card, Stack, Text } from '@/components/ui/primitives'
import type { ComponentState, ComponentResolution } from '@/lib/ui/components'
import type { GraphPayload } from '@/lib/knowledge/graph'

const MAX_DISPLAY_NODES = 20

interface KnowledgeGraphAdapterProps {
  payload?: GraphPayload
  scope?: string
  renderMode?: string
  __state?: ComponentState
  __resolution?: ComponentResolution
}

export const KnowledgeGraphAdapter = ({
  payload,
  scope,
  __state = 'active',
  __resolution,
}: KnowledgeGraphAdapterProps) => {
  // Resolved state
  if (__state === 'resolved' && __resolution) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-green-500">✓</span>
        <Text variant="body">{__resolution.label}</Text>
      </div>
    )
  }

  // No payload — fallback
  if (!payload) {
    return (
      <Card variant="outlined" className="border-slate-500/30 bg-slate-500/5">
        <Text variant="caption" className="text-slate-400">
          No graph data available.
        </Text>
      </Card>
    )
  }

  // Empty graph
  if (payload.nodes.length === 0) {
    return (
      <Card variant="outlined" className="border-slate-500/30 bg-slate-500/5">
        <Text variant="caption" className="text-slate-400">
          Knowledge graph is empty.
        </Text>
      </Card>
    )
  }

  const displayNodes = payload.nodes.slice(0, MAX_DISPLAY_NODES)
  const remaining = payload.nodes.length - displayNodes.length

  return (
    <Card variant="outlined" className="border-indigo-500/30 bg-indigo-500/5">
      <Stack gap="sm">
        <Text variant="label" className="text-slate-200">
          Knowledge Graph ({payload.nodes.length} node{payload.nodes.length !== 1 ? 's' : ''}, {payload.edges.length} connection{payload.edges.length !== 1 ? 's' : ''})
          {scope && <span className="text-slate-500 ml-2">[{scope}]</span>}
        </Text>
        <div className="space-y-1 font-mono text-xs">
          {displayNodes.map((node) => {
            const preview = node.content.length > 80
              ? node.content.slice(0, 80) + '...'
              : node.content
            const typeLabel = node.knowledgeType
              ? `[${node.knowledgeType}]`
              : '[unknown]'
            return (
              <div key={node.eventId} className="text-slate-300">
                <span className="text-slate-500">-</span>{' '}
                {preview}{' '}
                <span className="text-indigo-400/70">{typeLabel}</span>{' '}
                <span className="text-slate-600">(attention: {node.attentionScore.toFixed(2)})</span>
              </div>
            )
          })}
          {remaining > 0 && (
            <Text variant="caption" className="text-slate-600">
              ... and {remaining} more
            </Text>
          )}
        </div>
      </Stack>
    </Card>
  )
}
