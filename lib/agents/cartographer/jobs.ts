import { getAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/types'
import type {
  ExtractionAttempt,
  ExtractionCompletion,
  ExtractionFailureKind,
} from './types'
import { acceptsSessionContext, isClaimBlockedTopicContract } from './contract'
import type { LegacyTopicInput } from './topics'
import {
  isRetryableTopicError,
  TopicCandidatesRetryableError,
} from './topic-retry'

// How much of the preceding turn to carry. The probe measured every missing
// disambiguator in Isaac's session on the assistant side, and assistant turns
// there run 1,000-4,700 tokens, so an unbounded slice would dominate the
// extraction input. This cap keeps the cost O(1) per extraction regardless of
// how long the session runs.
const SESSION_CONTEXT_CHARS = 1200

// Only the actor's own turns and Voyager's replies. A room session can carry
// other people's messages, and resolving one person's claim against another
// person's words would leak across the audience boundary.
const loadSessionContext = async (
  sessionId: string,
  sourceEventId: string,
  actorId: string,
): Promise<string | null> => {
  const { data: source, error: sourceError } = await getAdminClient()
    .from('knowledge_events')
    .select('sequence_num')
    .eq('id', sourceEventId)
    .maybeSingle()
  if (sourceError) throw new Error(sourceError.message)
  if (!source) return null

  const { data, error } = await getAdminClient()
    .from('knowledge_events')
    .select('content, actor_type, actor_id')
    .eq('metadata->>session_id', sessionId)
    .lt('sequence_num', source.sequence_num)
    .order('sequence_num', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)

  const previous = data?.[0]
  if (!previous?.content) return null
  if (previous.actor_type !== 'voyager' && previous.actor_id !== actorId) {
    return null
  }
  const content = previous.content.trim()
  if (content.length === 0) return null
  return content.length <= SESSION_CONTEXT_CHARS
    ? content
    : `${content.slice(0, SESSION_CONTEXT_CHARS)}…`
}

export const beginExtractionAttempt = async (input: {
  userId: string
  sourceEventId?: string
  modelProvider: string
  modelId: string
  resolverLabel: string
}): Promise<ExtractionAttempt | null> => {
  const { data, error } = await getAdminClient().rpc(
    'begin_knowledge_extraction_attempt',
    {
      p_requesting_user_id: input.userId,
      p_model_provider: input.modelProvider,
      p_model_id: input.modelId,
      p_resolver_label: input.resolverLabel,
      p_source_event_id: input.sourceEventId ?? null,
      p_lease_seconds: 120,
    },
  )
  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (!row) return null

  const candidateIds = row.candidate_person_ids ?? []
  const { data: profiles, error: profileError } = candidateIds.length === 0
    ? { data: [], error: null }
    : await getAdminClient()
      .from('profiles')
      .select('id, display_name')
      .in('id', candidateIds)
  if (profileError) throw new Error(profileError.message)

  const names = new Map((profiles ?? []).map((profile) => [
    profile.id,
    profile.display_name,
  ]))
  const sessionContext = acceptsSessionContext(row.extractor_version)
    && row.source_session_id
    ? await loadSessionContext(
      row.source_session_id,
      row.source_event_id,
      row.source_actor_id,
    )
    : null
  return {
    attemptId: row.attempt_id,
    leaseToken: row.lease_token,
    sourceEventId: row.source_event_id,
    extractorVersion: row.extractor_version,
    knowledgeAudienceId: row.knowledge_audience_id,
    sourceContent: row.source_content,
    sourceEventType: row.source_event_type,
    sourceActorId: row.source_actor_id,
    sourceSessionId: row.source_session_id,
    sessionContext,
    attemptNumber: row.attempt_number,
    candidates: candidateIds.map((id) => ({
      personId: id,
      displayName: names.get(id) ?? 'Known person',
    })),
  }
}

export const completeExtractionAttempt = async (input: {
  attempt: ExtractionAttempt
  result: 'succeeded' | 'no_claim' | ExtractionFailureKind
  rawOutput?: Json
  claim?: string
  aboutPersonId?: string
  knowledgeType?: 'domain' | 'operational' | 'preference'
  attentionScore?: number
  embedding?: string
  topicInputs?: LegacyTopicInput[] | Json
  topicCandidateSnapshot?: Json
  errorClass?: string
  inputTokens?: number
  outputTokens?: number
}): Promise<ExtractionCompletion> => {
  const args = {
      p_attempt_id: input.attempt.attemptId,
      p_lease_token: input.attempt.leaseToken,
      p_result: input.result,
      p_raw_output: input.rawOutput ?? null,
      p_claim: input.claim ?? null,
      p_about_person_id: input.aboutPersonId ?? null,
      p_knowledge_type: input.knowledgeType ?? null,
      p_attention_score: input.attentionScore ?? null,
      p_embedding: input.embedding ?? null,
      p_topic_inputs: input.topicInputs ?? null,
      p_error_class: input.errorClass ?? null,
      p_input_tokens: input.inputTokens ?? null,
      p_output_tokens: input.outputTokens ?? null,
  }
  const claimBlockedTopics = isClaimBlockedTopicContract(
    input.attempt.extractorVersion,
  )
  // v4, v5 and v6 all complete through the claim-blocked path; only pre-v4
  // contracts use the generic one.
  const { data, error } = claimBlockedTopics
    ? await getAdminClient().rpc('complete_v4_knowledge_extraction_attempt', {
      ...args,
      p_topic_candidate_snapshot: input.topicCandidateSnapshot ?? null,
    })
    : await getAdminClient().rpc('complete_knowledge_extraction_attempt', args)
  if (error && isRetryableTopicError(error.message)) {
    throw new TopicCandidatesRetryableError()
  }
  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (!row) throw new Error('knowledge_extraction_completion_returned_no_row')
  return {
    outcome: row.outcome,
    unitId: row.unit_id,
    replayed: row.replayed,
  }
}
