import { getAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/types'
import {
  isRetryableRelationError,
  RelationWriteRetryableError,
} from './relation-retry'
import type {
  ExtractionFailureKind,
  RelationAttempt,
  RelationCompletion,
  RelationWrite,
} from './types'

export const beginRelationAttempt = async (input: {
  userId: string
  unitId?: string
  modelProvider: string
  modelId: string
  resolverLabel: string
}): Promise<RelationAttempt | null> => {
  const { data, error } = await getAdminClient().rpc('begin_relation_attempt', {
    p_requesting_user_id: input.userId,
    p_model_provider: input.modelProvider,
    p_model_id: input.modelId,
    p_resolver_label: input.resolverLabel,
    p_unit_id: input.unitId ?? null,
    p_lease_seconds: 120,
  })
  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (!row) return null
  return {
    attemptId: row.attempt_id,
    leaseToken: row.lease_token,
    unitId: row.unit_id,
    personId: row.person_id,
    contractVersion: row.contract_version,
    focusClaim: row.focus_claim,
    candidates: row.candidates,
    attemptNumber: row.attempt_number,
  }
}

export const completeRelationAttempt = async (input: {
  attempt: RelationAttempt
  result: 'succeeded' | ExtractionFailureKind
  rawOutput?: Json
  relations?: RelationWrite[]
  grantRequests?: Json[]
  errorClass?: string
  inputTokens?: number
  outputTokens?: number
}): Promise<RelationCompletion> => {
  const { data, error } = await getAdminClient().rpc(
    'complete_relation_attempt',
    {
      p_attempt_id: input.attempt.attemptId,
      p_lease_token: input.attempt.leaseToken,
      p_result: input.result,
      p_raw_output: input.rawOutput ?? null,
      p_relations: (input.relations ?? []) as unknown as Json,
      p_grant_requests: input.grantRequests ?? [],
      p_error_class: input.errorClass ?? null,
      p_input_tokens: input.inputTokens ?? null,
      p_output_tokens: input.outputTokens ?? null,
    },
  )
  if (error && isRetryableRelationError(error.message)) {
    throw new RelationWriteRetryableError()
  }
  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (!row) throw new Error('knowledge_relation_completion_returned_no_row')
  return {
    outcome: row.outcome,
    edgeIds: row.edge_ids,
    replayed: row.replayed,
  }
}
