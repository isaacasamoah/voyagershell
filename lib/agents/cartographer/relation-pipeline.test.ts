import type { LanguageModel } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  beginRelationAttempt: vi.fn(),
  completeRelationAttempt: vi.fn(),
  judgeRelationConflicts: vi.fn(),
}))
vi.mock('./relation-jobs', () => ({
  beginRelationAttempt: mocks.beginRelationAttempt,
  completeRelationAttempt: mocks.completeRelationAttempt,
}))
vi.mock('./relation-judge', () => ({
  judgeRelationConflicts: mocks.judgeRelationConflicts,
}))

import { runRelationPipeline } from './relation-pipeline'
import {
  RELATION_WRITE_RETRY_EXHAUSTED_ERROR_CLASS,
  RelationWriteRetryableError,
} from './relation-retry'

const attempt = {
  attemptId: '73000000-0000-4000-8000-000000000001',
  leaseToken: '73000000-0000-4000-8000-000000000002',
  unitId: '73000000-0000-4000-8000-000000000003',
  personId: '73000000-0000-4000-8000-000000000004',
  contractVersion: 'relation-conflict-v2',
  focusClaim: 'The physio said no running for eight weeks.',
  candidates: [
    {
      unitId: '73000000-0000-4000-8000-000000000005',
      claim: 'Marathon training starts Monday.',
      topicLabels: ['marathon training'],
      similarity: 0.47,
    },
  ],
  attemptNumber: 1,
}
const input = {
  userId: attempt.personId,
  model: {} as LanguageModel,
  modelProvider: 'openai',
  modelId: 'classification-model',
  resolverLabel: 'balanced',
}

describe('per-person relation pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.beginRelationAttempt.mockResolvedValue(attempt)
    mocks.judgeRelationConflicts.mockResolvedValue({
      kind: 'structured',
      rawOutput: { relations: [] },
      relations: [],
      inputTokens: 20,
      outputTokens: 5,
    })
    mocks.completeRelationAttempt.mockResolvedValue({
      outcome: 'succeeded',
      edgeIds: [],
      replayed: false,
    })
  })

  it('records compatible co-filed units as a successful zero-edge pass', async () => {
    const result = await runRelationPipeline(input)

    expect(mocks.completeRelationAttempt).toHaveBeenCalledWith({
      attempt,
      result: 'succeeded',
      rawOutput: { relations: [] },
      relations: [],
      inputTokens: 20,
      outputTokens: 5,
    })
    expect(result).toEqual({
      kind: 'completed',
      unitId: attempt.unitId,
      outcome: 'succeeded',
      edgeIds: [],
    })
  })

  it('preserves canonical-edge replay as a successful completion', async () => {
    mocks.completeRelationAttempt.mockResolvedValue({
      outcome: 'succeeded',
      edgeIds: ['73000000-0000-4000-8000-000000000006'],
      replayed: true,
    })

    expect(await runRelationPipeline(input)).toEqual(
      expect.objectContaining({
        kind: 'completed',
        edgeIds: ['73000000-0000-4000-8000-000000000006'],
      }),
    )
  })

  it('maps provider failure to an immutable outcome before releasing the job', async () => {
    mocks.judgeRelationConflicts.mockResolvedValue({
      kind: 'failed',
      failure: 'provider_failed',
      errorClass: 'APICallError',
    })
    mocks.completeRelationAttempt.mockResolvedValue({
      outcome: 'provider_failed',
      edgeIds: [],
      replayed: false,
    })

    await runRelationPipeline(input)

    expect(mocks.completeRelationAttempt).toHaveBeenCalledWith({
      attempt,
      result: 'provider_failed',
      errorClass: 'APICallError',
    })
  })

  it('bounds retryable writer races and completes the leased attempt on exhaustion', async () => {
    mocks.completeRelationAttempt.mockReset()
    for (let index = 0; index < 3; index++) {
      mocks.completeRelationAttempt.mockRejectedValueOnce(
        new RelationWriteRetryableError(),
      )
    }
    mocks.completeRelationAttempt.mockResolvedValueOnce({
      outcome: 'provider_failed',
      edgeIds: [],
      replayed: false,
    })

    const result = await runRelationPipeline(input)

    expect(mocks.completeRelationAttempt).toHaveBeenCalledTimes(4)
    expect(mocks.completeRelationAttempt.mock.calls[3][0]).toEqual({
      attempt,
      result: 'provider_failed',
      errorClass: RELATION_WRITE_RETRY_EXHAUSTED_ERROR_CLASS,
    })
    expect(result).toEqual(
      expect.objectContaining({
        kind: 'completed',
        outcome: 'provider_failed',
      }),
    )
  })
})
