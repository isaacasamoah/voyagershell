import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ rpc: mocks.rpc }),
}))

import { completeExtractionAttempt } from './jobs'
import { TopicCandidatesRetryableError } from './topic-retry'

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

describe('Cartographer completion RPC errors', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    'knowledge_topic_candidates_stale',
    'knowledge_topic_candidate_not_authorized',
  ])('maps %s to retryable topic treatment', async (message) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message } })

    await expect(completeExtractionAttempt({
      attempt,
      result: 'succeeded',
      rawOutput: {},
      claim: 'The QE work shipped.',
      knowledgeType: 'domain',
      attentionScore: 0.8,
      embedding: '[1,0]',
      topicInputs: [],
      topicCandidateSnapshot: [],
    })).rejects.toBeInstanceOf(TopicCandidatesRetryableError)
  })

  it('routes runtime-current v4 through the claim-blocked topic completion', async () => {
    mocks.rpc.mockResolvedValue({ data: [{
      outcome: 'no_claim', unit_id: null, replayed: false,
    }], error: null })

    await completeExtractionAttempt({
      attempt,
      result: 'no_claim',
      rawOutput: {
        claim: null,
        aboutPersonId: null,
        knowledgeType: 'domain',
        attentionScore: 0,
        contextSnippet: 'No durable claim.',
        topics: [],
      },
      topicInputs: [],
      topicCandidateSnapshot: [],
    })

    expect(mocks.rpc).toHaveBeenCalledWith(
      'complete_v4_knowledge_extraction_attempt',
      expect.objectContaining({ p_topic_candidate_snapshot: [] }),
    )
  })
})
