import type { LanguageModel } from 'ai'
import type { Json } from '@/lib/supabase/types'
import type { ExtractionObject } from './contract'
import {
  completeExtractionAttempt,
} from './jobs'
import {
  TOPIC_WRITE_MAX_ATTEMPTS,
  TOPIC_WRITE_RETRY_EXHAUSTED_ERROR_CLASS,
  TopicCandidatesRetryableError,
  waitForTopicRetry,
} from './topic-retry'
import { matchKnowledgeTopics } from './topic-matcher'
import {
  findTopicCandidates,
  toTopicCandidateSnapshot,
  toTopicWriteInputs,
} from './topics'
import type {
  ExtractionAttempt,
  ExtractionCompletion,
} from './types'

interface Usage {
  inputTokens: number | undefined
  outputTokens: number | undefined
}

export type MatchedCompletion =
  | { kind: 'completed'; completion: ExtractionCompletion; usage: Usage }
  | { kind: 'matcher_failed'; completion: ExtractionCompletion }

const addUsage = (
  first: number | undefined,
  second: number | undefined,
): number | undefined => (
  first === undefined || second === undefined ? undefined : first + second
)

export const completeMatchedExtraction = async (input: {
  model: LanguageModel
  attempt: ExtractionAttempt
  object: ExtractionObject
  embedding: string
  embeddingVector: number[]
  extractionUsage: Usage
}): Promise<MatchedCompletion> => {
  for (
    let attemptNumber = 1;
    attemptNumber <= TOPIC_WRITE_MAX_ATTEMPTS;
    attemptNumber++
  ) {
    const candidates = await findTopicCandidates(
      input.attempt.extractorVersion,
      input.attempt.knowledgeAudienceId,
      input.embeddingVector,
    )
    const matched = await matchKnowledgeTopics(
      input.model,
      input.object.claim as string,
      candidates,
    )
    if (matched.kind === 'failed') {
      const completion = await completeExtractionAttempt({
        attempt: input.attempt,
        result: matched.failure,
        errorClass: matched.errorClass,
      })
      return { kind: 'matcher_failed', completion }
    }

    const rawOutput = {
      ...input.object,
      topics: matched.topics,
    } as Json
    const usage = {
      inputTokens: addUsage(
        input.extractionUsage.inputTokens,
        matched.inputTokens,
      ),
      outputTokens: addUsage(
        input.extractionUsage.outputTokens,
        matched.outputTokens,
      ),
    }
    try {
      const completion = await completeExtractionAttempt({
        attempt: input.attempt,
        result: 'succeeded',
        rawOutput,
        claim: input.object.claim as string,
        aboutPersonId: input.object.aboutPersonId ?? undefined,
        knowledgeType: input.object.knowledgeType,
        attentionScore: input.object.attentionScore,
        embedding: input.embedding,
        topicInputs: toTopicWriteInputs(matched.topics),
        topicCandidateSnapshot: toTopicCandidateSnapshot(candidates),
        ...usage,
      })
      return { kind: 'completed', completion, usage }
    } catch (error) {
      if (!(error instanceof TopicCandidatesRetryableError)) throw error
      if (attemptNumber < TOPIC_WRITE_MAX_ATTEMPTS) {
        await waitForTopicRetry(attemptNumber)
        continue
      }
      const completion = await completeExtractionAttempt({
        attempt: input.attempt,
        result: 'provider_failed',
        errorClass: TOPIC_WRITE_RETRY_EXHAUSTED_ERROR_CLASS,
      })
      return { kind: 'matcher_failed', completion }
    }
  }
  throw new Error('knowledge_topic_candidate_retry_loop_unreachable')
}
