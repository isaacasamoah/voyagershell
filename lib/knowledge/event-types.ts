export type SourceEventType =
  | 'conversation'
  | 'message'
  | 'document'
  | 'slack_message'
  | 'jira_update'
  | 'explicit'

export type Classification =
  | 'fact'
  | 'preference'
  | 'decision'
  | 'procedure'
  | 'insight'
  | 'entity'

export type ActorType = 'user' | 'voyager' | 'system' | 'pipeline'
export type SourceType = 'conversation' | 'slack' | 'jira' | 'document' | 'explicit'
export type KnowledgeType = 'domain' | 'operational' | 'preference'

export interface SourceEventMetadata {
  classifications?: Classification[]
  entities?: string[]
  topics?: string[]
  session_id?: string
  message_id?: string
  addressed_to?: string[]
  source?: string
  sender_display_name?: string
  sender_user_id?: string
  owner_display_name?: string
  space_id?: string
}

export interface CreateSourceEventParams {
  eventType: SourceEventType
  content: string
  userId?: string
  voyageSlug?: string
  participants?: string[]
  metadata?: SourceEventMetadata
  sourceType?: SourceType
  sourceRef?: Record<string, unknown>
  actorId?: string
  actorType?: ActorType
}

export interface KnowledgeEnrichmentParams {
  knowledgeType?: KnowledgeType
  attentionScore: number
  contextSnippet?: string
}
