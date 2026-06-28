import React from 'react'
import type { KnowledgeNode } from '@/lib/knowledge/search'

interface GraphNodeProps {
  node: KnowledgeNode
}

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function GraphNode({ node }: GraphNodeProps) {
  const attention = node.attentionScore ?? 0
  const label = node.knowledgeType ?? 'operational'
  const preview = node.content.length > 120 ? node.content.slice(0, 120) + '…' : node.content

  return (
    <div className="border border-white/10 rounded-lg p-3 bg-white/5 hover:bg-white/10 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-gray-200 flex-1">{preview}</p>
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 shrink-0">{label}</span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.round(attention * 100)}%` }} />
        </div>
        <span className="text-xs text-gray-500">{Math.round(attention * 100)}%</span>
        {node.createdAt && <span className="text-xs text-gray-500">{timeAgo(node.createdAt)}</span>}
      </div>
    </div>
  )
}
