import type { KnowledgeType } from '@/lib/knowledge/events'
import type { GraphEdgeKind } from '@/lib/knowledge/kernel/contract'
import type { GraphNodeReference } from '@/lib/knowledge/kernel/graph-edge-writer'

export interface CartographerPayload {
  sessionId: string
  userId: string
  voyageSlug?: string
}

export interface Stage1Assessment {
  eventId: string
  knowledgeType: KnowledgeType
  attentionScore: number
  contextSnippet: string
}

export interface Stage2Connection {
  source: GraphNodeReference
  target: GraphNodeReference
  kind: GraphEdgeKind
}

export interface KnowledgeEventRow {
  event_id: string
  content: string
  source_created_at: string
}
