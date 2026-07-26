import { getAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/types'
import type {
  ExtractionAttempt,
  ExtractionCompletion,
  ExtractionFailureKind,
} from './types'

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
  errorClass?: string
  inputTokens?: number
  outputTokens?: number
}): Promise<ExtractionCompletion> => {
  const { data, error } = await getAdminClient().rpc(
    'complete_knowledge_extraction_attempt',
    {
      p_attempt_id: input.attempt.attemptId,
      p_lease_token: input.attempt.leaseToken,
      p_result: input.result,
      p_raw_output: input.rawOutput ?? null,
      p_claim: input.claim ?? null,
      p_about_person_id: input.aboutPersonId ?? null,
      p_error_class: input.errorClass ?? null,
      p_input_tokens: input.inputTokens ?? null,
      p_output_tokens: input.outputTokens ?? null,
    },
  )
  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (!row) throw new Error('knowledge_extraction_completion_returned_no_row')
  return {
    outcome: row.outcome,
    unitId: row.unit_id,
    replayed: row.replayed,
  }
}
