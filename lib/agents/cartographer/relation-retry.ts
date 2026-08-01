export const RELATION_WRITE_MAX_ATTEMPTS = 3
export const RELATION_WRITE_RETRY_EXHAUSTED_ERROR_CLASS =
  'knowledge_relation_write_retry_exhausted'

const RETRYABLE_RELATION_ERRORS = [
  'could not serialize access',
  'deadlock detected',
  'canceling statement due to lock timeout',
] as const

export class RelationWriteRetryableError extends Error {
  constructor() {
    super('knowledge_relation_write_retryable')
    this.name = 'RelationWriteRetryableError'
  }
}

export const isRetryableRelationError = (message: string): boolean =>
  RETRYABLE_RELATION_ERRORS.some((errorClass) => message.includes(errorClass))
