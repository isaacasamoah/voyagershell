export const TOPIC_WRITE_MAX_ATTEMPTS = 5
export const TOPIC_WRITE_RETRY_EXHAUSTED_ERROR_CLASS =
  'knowledge_topic_candidate_retry_exhausted'
export const TOPIC_BACKFILL_RETRY_EXHAUSTED =
  'knowledge_topic_backfill_candidate_retry_exhausted'

const RETRYABLE_TOPIC_ERRORS = [
  'knowledge_topic_candidates_stale',
  'knowledge_topic_candidate_not_authorized',
] as const

export class TopicCandidatesRetryableError extends Error {
  constructor() {
    super('knowledge_topic_candidates_retryable')
    this.name = 'TopicCandidatesRetryableError'
  }
}

export const isRetryableTopicError = (message: string): boolean => (
  RETRYABLE_TOPIC_ERRORS.some((errorClass) => message.includes(errorClass))
)

export const waitForTopicRetry = async (attemptNumber: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, attemptNumber * 10))
}
