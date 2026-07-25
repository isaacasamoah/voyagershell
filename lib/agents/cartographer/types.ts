import type { KnowledgeType } from '@/lib/knowledge/event-types'
import type { CARTOGRAPHER_EDGE_KINDS } from './stage2'

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
  fromEventId: string
  toEventId: string
  edgeType: (typeof CARTOGRAPHER_EDGE_KINDS)[number]
}

export interface KnowledgeEventRow {
  event_id: string
  content: string
  source_created_at: string
}
