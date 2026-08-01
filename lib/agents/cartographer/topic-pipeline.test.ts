import type { LanguageModel } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  completeExtractionAttempt: vi.fn(),
  findTopicCandidates: vi.fn(),
  matchKnowledgeTopics: vi.fn(),
}))
vi.mock('./jobs', async () => {
  const actual = await vi.importActual<typeof import('./jobs')>('./jobs')
  return { ...actual, completeExtractionAttempt: mocks.completeExtractionAttempt }
})
vi.mock('./topics', async () => {
  const actual = await vi.importActual<typeof import('./topics')>('./topics')
  return { ...actual, findTopicCandidates: mocks.findTopicCandidates }
})
vi.mock('./topic-matcher', () => ({
  matchKnowledgeTopics: mocks.matchKnowledgeTopics,
}))

import { completeMatchedExtraction } from './topic-pipeline'
import {
  TOPIC_WRITE_RETRY_EXHAUSTED_ERROR_CLASS,
  TopicCandidatesRetryableError,
} from './topic-retry'

const attempt = {
  attemptId: '72000000-0000-4000-8000-000000000001',
  leaseToken: '72000000-0000-4000-8000-000000000002',
  sourceEventId: '72000000-0000-4000-8000-000000000003',
  extractorVersion: 'cartographer-single-claim-v4',
  knowledgeAudienceId: '72000000-0000-4000-8000-000000000004',
  sourceContent: 'The QE work shipped.',
  sourceEventType: 'message',
  sourceActorId: '72000000-0000-4000-8000-000000000005',
  sourceSessionId: null,
  attemptNumber: 1,
  candidates: [],
}
const object = {
  claim: 'The QE work shipped.',
  aboutPersonId: null,
  knowledgeType: 'domain' as const,
  attentionScore: 0.8,
  contextSnippet: 'The QE work shipped.',
}

describe('claim-blocked topic pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findTopicCandidates
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        topicId: '72000000-0000-4000-8000-000000000008',
        label: 'quantum engines',
        representativeUnitId: '72000000-0000-4000-8000-000000000010',
        representativeClaim: 'Quantum propulsion research is next quarter.',
        similarity: 0.44,
      }])
    mocks.matchKnowledgeTopics
      .mockResolvedValueOnce({
        kind: 'structured',
        topics: [{ kind: 'new', label: 'the qe work' }],
        inputTokens: 20,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        kind: 'structured',
        topics: [{
          kind: 'existing',
          topicId: '72000000-0000-4000-8000-000000000008',
        }],
        inputTokens: 22,
        outputTokens: 4,
      })
    mocks.completeExtractionAttempt
      .mockRejectedValueOnce(new TopicCandidatesRetryableError())
      .mockResolvedValueOnce({
        outcome: 'succeeded',
        unitId: '72000000-0000-4000-8000-000000000009',
        replayed: false,
      })
  })

  it('re-matches a stale new-topic decision against the fresh candidate window', async () => {
    const result = await completeMatchedExtraction({
      model: {} as LanguageModel,
      attempt,
      object,
      embedding: '[1,0]',
      embeddingVector: [1, 0],
      extractionUsage: { inputTokens: 100, outputTokens: 20 },
    })

    expect(mocks.findTopicCandidates).toHaveBeenCalledTimes(2)
    expect(mocks.matchKnowledgeTopics).toHaveBeenCalledTimes(2)
    expect(mocks.completeExtractionAttempt.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        topicCandidateSnapshot: [[
          '72000000-0000-4000-8000-000000000008',
          '72000000-0000-4000-8000-000000000010',
        ]],
        topicInputs: [{
          kind: 'existing',
          topicId: '72000000-0000-4000-8000-000000000008',
        }],
        inputTokens: 122,
        outputTokens: 24,
      }),
    )
    expect(result).toEqual(expect.objectContaining({ kind: 'completed' }))
  })

  it('caps retryable candidate races and releases the lease as a failure', async () => {
    mocks.findTopicCandidates.mockReset().mockResolvedValue([])
    mocks.matchKnowledgeTopics.mockReset().mockResolvedValue({
      kind: 'structured',
      topics: [{ kind: 'new', label: 'the qe work' }],
      inputTokens: 20,
      outputTokens: 5,
    })
    mocks.completeExtractionAttempt.mockReset()
    for (let index = 0; index < 5; index++) {
      mocks.completeExtractionAttempt
        .mockRejectedValueOnce(new TopicCandidatesRetryableError())
    }
    mocks.completeExtractionAttempt.mockResolvedValueOnce({
      outcome: 'provider_failed',
      unitId: null,
      replayed: false,
    })

    const result = await completeMatchedExtraction({
      model: {} as LanguageModel,
      attempt,
      object,
      embedding: '[1,0]',
      embeddingVector: [1, 0],
      extractionUsage: { inputTokens: 100, outputTokens: 20 },
    })

    expect(mocks.findTopicCandidates).toHaveBeenCalledTimes(5)
    expect(mocks.matchKnowledgeTopics).toHaveBeenCalledTimes(5)
    expect(mocks.completeExtractionAttempt).toHaveBeenCalledTimes(6)
    expect(mocks.completeExtractionAttempt.mock.calls[5][0]).toEqual({
      attempt,
      result: 'provider_failed',
      errorClass: TOPIC_WRITE_RETRY_EXHAUSTED_ERROR_CLASS,
    })
    expect(result).toEqual({
      kind: 'matcher_failed',
      completion: { outcome: 'provider_failed', unitId: null, replayed: false },
    })
  })
})
