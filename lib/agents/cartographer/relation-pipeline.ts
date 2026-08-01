import type { LanguageModel } from 'ai'
import { judgeRelationConflicts } from './relation-judge'
import { beginRelationAttempt, completeRelationAttempt } from './relation-jobs'
import {
  RELATION_WRITE_MAX_ATTEMPTS,
  RELATION_WRITE_RETRY_EXHAUSTED_ERROR_CLASS,
  RelationWriteRetryableError,
  waitForRelationRetry,
} from './relation-retry'
import type {
  RelationAttempt,
  RelationCompletion,
  RelationWrite,
} from './types'

export type RelationPipelineResult =
  | { kind: 'no_job' }
  | {
      kind: 'completed'
      unitId: string
      outcome: RelationCompletion['outcome']
      edgeIds: string[]
    }

const completeWithRetry = async (input: {
  attempt: RelationAttempt
  rawOutput: Parameters<typeof completeRelationAttempt>[0]['rawOutput']
  relations: RelationWrite[]
  inputTokens: number | undefined
  outputTokens: number | undefined
}): Promise<RelationCompletion> => {
  for (
    let attemptNumber = 1;
    attemptNumber <= RELATION_WRITE_MAX_ATTEMPTS;
    attemptNumber++
  ) {
    try {
      return await completeRelationAttempt({
        ...input,
        result: 'succeeded',
      })
    } catch (error) {
      if (!(error instanceof RelationWriteRetryableError)) throw error
      if (attemptNumber < RELATION_WRITE_MAX_ATTEMPTS) {
        await waitForRelationRetry(attemptNumber)
        continue
      }
      return completeRelationAttempt({
        attempt: input.attempt,
        result: 'provider_failed',
        errorClass: RELATION_WRITE_RETRY_EXHAUSTED_ERROR_CLASS,
      })
    }
  }
  throw new Error('knowledge_relation_write_retry_loop_unreachable')
}

export const runRelationPipeline = async (input: {
  userId: string
  model: LanguageModel
  modelProvider: string
  modelId: string
  resolverLabel: string
}): Promise<RelationPipelineResult> => {
  const attempt = await beginRelationAttempt(input)
  if (!attempt) return { kind: 'no_job' }
  const judged = await judgeRelationConflicts(input.model, attempt)
  const completion =
    judged.kind === 'failed'
      ? await completeRelationAttempt({
          attempt,
          result: judged.failure,
          errorClass: judged.errorClass,
        })
      : await completeWithRetry({
          attempt,
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
