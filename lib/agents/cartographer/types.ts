import type { KnowledgeType } from '@/lib/knowledge/event-types'

export interface CartographerPayload {
  userId: string
  sourceEventId?: string
}

export interface Stage1Assessment {
  eventId: string
  knowledgeType: KnowledgeType
  attentionScore: number
  contextSnippet: string
}

export interface PersonCandidate {
  personId: string
  displayName: string
}

export interface ExtractionAttempt {
  attemptId: string
  leaseToken: string
  sourceEventId: string
  extractorVersion: string
  knowledgeAudienceId: string
  sourceContent: string
  sourceEventType: string
  sourceActorId: string
  sourceSessionId: string | null
  attemptNumber: number
  candidates: PersonCandidate[]
}

export type ExtractionFailureKind = 'provider_failed' | 'malformed_output'

export type ExtractionRun =
  | {
      kind: 'structured'
      object: import('./contract').ExtractionObject
      inputTokens: number
      outputTokens: number
    }
  | { kind: 'failed'; failure: ExtractionFailureKind; errorClass: string }

export interface ExtractionCompletion {
  outcome:
    | 'succeeded'
    | 'no_claim'
    | 'provider_failed'
    | 'malformed_output'
    | 'commit_rejected'
    | 'expired'
  unitId: string | null
  replayed: boolean
}

export interface KnowledgeEventRow {
  event_id: string
  content: string
  source_created_at: string
}
