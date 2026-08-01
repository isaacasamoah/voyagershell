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

export interface TopicCandidate {
  topicId: string
  label: string
  representativeUnitId?: string
  representativeClaim?: string
  similarity: number
}

export type TopicMatchDecision =
  | { kind: 'existing'; topicId: string }
  | { kind: 'new'; label: string }

export interface TopicMatcherRun {
  kind: 'structured'
  topics: TopicMatchDecision[]
  inputTokens: number | undefined
  outputTokens: number | undefined
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
      object: import('./contract').AnyExtractionObject
      // Undefined when the provider reported no usage. Recording an unknown
      // count as 0 would assert the call consumed nothing, which is a
      // different fact from not knowing.
      inputTokens: number | undefined
      outputTokens: number | undefined
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

export interface TopicBackfillUnit {
  unitId: string
  sourceEventId: string
  sourceContent: string
  sourceActorId: string
  claim: string
  knowledgeAudienceId: string
  embedding: string | null
}

export type RelationVerdict = 'contradicts' | 'supersedes'

export interface RelationCandidate {
  unitId: string
  claim: string
  topicLabels: string[]
  similarity: number | null
}

export interface RelationAttempt {
  attemptId: string
  leaseToken: string
  unitId: string
  personId: string
  contractVersion: string
  focusClaim: string
  candidates: RelationCandidate[]
  attemptNumber: number
}

export interface RelationWrite {
  candidateUnitId: string
  sourceUnitId: string
  targetUnitId: string
  kind: RelationVerdict
}

export interface RelationCompletion {
  outcome: ExtractionCompletion['outcome']
  edgeIds: string[]
  replayed: boolean
}
