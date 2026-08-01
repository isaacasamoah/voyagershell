import type { LanguageModel } from 'ai'
import { judgeRelationConflicts } from './relation-judge'
import { beginRelationAttempt, completeRelationAttempt } from './relation-jobs'
import {
  RELATION_WRITE_MAX_ATTEMPTS,
  RELATION_WRITE_RETRY_EXHAUSTED_ERROR_CLASS,
  RelationWriteRetryableError,
} from './relation-retry'
import { RELATION_CONTRACT_VERSION } from './relation-contract'
import { runCartographerRetry, waitForCartographerRetry } from './retry'
import type { RelationCompletion } from './types'

export type RelationPipelineResult =
  | { kind: 'no_job' }
  | {
      kind: 'completed'
      unitId: string
      outcome: RelationCompletion['outcome']
      edgeIds: string[]
    }

type RelationCompletionInput = Parameters<typeof completeRelationAttempt>[0]

export const RELATION_CONTRACT_MISMATCH_ERROR_CLASS =
  'knowledge_relation_contract_version_mismatch'

const completeWithRetry = async (
  input: RelationCompletionInput,
): Promise<RelationCompletion> => runCartographerRetry({
  maxAttempts: RELATION_WRITE_MAX_ATTEMPTS,
  run: () => completeRelationAttempt(input),
  isRetryable: (error) => error instanceof RelationWriteRetryableError,
  wait: waitForCartographerRetry,
  onExhausted: () => completeRelationAttempt({
    attempt: input.attempt,
    result: 'provider_failed',
    errorClass: RELATION_WRITE_RETRY_EXHAUSTED_ERROR_CLASS,
  }),
})

export const runRelationPipeline = async (input: {
  userId: string
  model: LanguageModel
  modelProvider: string
  modelId: string
  resolverLabel: string
}): Promise<RelationPipelineResult> => {
  const attempt = await beginRelationAttempt(input)
  if (!attempt) return { kind: 'no_job' }
  const judged = attempt.contractVersion === RELATION_CONTRACT_VERSION
    ? await judgeRelationConflicts(input.model, attempt)
    : {
        kind: 'failed' as const,
        failure: 'provider_failed' as const,
        errorClass: RELATION_CONTRACT_MISMATCH_ERROR_CLASS,
      }
  const completion =
    judged.kind === 'failed'
      ? await completeWithRetry({
          attempt,
          result: judged.failure,
          errorClass: judged.errorClass,
        })
      : await completeWithRetry({
          attempt,
          result: 'succeeded',
          rawOutput: judged.rawOutput,
          relations: judged.relations,
          inputTokens: judged.inputTokens,
          outputTokens: judged.outputTokens,
        })
  return {
    kind: 'completed',
    unitId: attempt.unitId,
    outcome: completion.outcome,
    edgeIds: completion.edgeIds,
  }
}
