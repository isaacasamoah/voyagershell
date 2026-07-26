import type { Classification } from './event-types'

export interface KnowledgeNode {
  eventId: string
  content: string
  classifications: string[]
  entities: string[]
  topics: string[]
  createdAt: Date
  similarity?: number
  knowledgeType: string | null
  attentionScore: number
  contextSnippet: string | null
  senderDisplayName?: string
  senderUserId?: string
  eventType?: string
}

export interface SearchOptions {
  threshold?: number
  limit?: number
  classifications?: Classification[]
  voyageSlug?: string
  knowledgeType?: string
  minAttention?: number
}

export interface KnowledgeNodeInput {
  event_id: string
  content: string
  source_created_at: string
  classifications?: string[] | null
  entities?: string[] | null
  topics?: string[] | null
  participants?: string[] | null
  similarity?: number
  knowledge_type?: string | null
  attention_score?: number | null
  context_snippet?: string | null
  sender_display_name?: string | null
  sender_user_id?: string | null
  event_type?: string | null
}

export interface GrepOptions {
  scope?: 'personal' | 'voyage' | 'all'
  caseSensitive?: boolean
  limit?: number
  voyageSlug?: string
  minAttention?: number
}

export interface GrepResult extends Omit<KnowledgeNode, 'similarity'> {
  highlight: string
  matchStart: number
}

export const transformKnowledgeNode = (row: KnowledgeNodeInput): KnowledgeNode => ({
  eventId: row.event_id,
  content: row.content,
  classifications: row.classifications ?? [],
  entities: row.entities ?? [],
  topics: row.topics ?? [],
  createdAt: new Date(row.source_created_at),
  similarity: row.similarity,
  knowledgeType: row.knowledge_type ?? null,
  attentionScore: row.attention_score ?? 0.5,
  contextSnippet: row.context_snippet ?? null,
  senderDisplayName: row.sender_display_name ?? undefined,
  senderUserId: row.sender_user_id ?? undefined,
  eventType: row.event_type ?? undefined,
})

export type { Classification }
