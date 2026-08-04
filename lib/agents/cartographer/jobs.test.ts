import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}))

import { beginExtractionAttempt, completeExtractionAttempt } from './jobs'
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
  sessionContext: null,
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

describe('session context loading', () => {
  const sessionId = '72000000-0000-4000-8000-0000000000a1'
  const actorId = '72000000-0000-4000-8000-000000000005'
  const otherPersonId = '72000000-0000-4000-8000-0000000000ff'

  const arrange = (previous: {
    content: string
    actor_type: string
    actor_id: string
  } | null) => {
    mocks.rpc.mockResolvedValue({
      data: [{
        attempt_id: attempt.attemptId,
        lease_token: attempt.leaseToken,
        source_event_id: attempt.sourceEventId,
        extractor_version: 'cartographer-single-claim-v6',
        knowledge_audience_id: attempt.knowledgeAudienceId,
        source_content: attempt.sourceContent,
        source_event_type: 'message',
        source_actor_id: actorId,
        source_session_id: sessionId,
        attempt_number: 1,
        candidate_person_ids: [],
      }],
      error: null,
    })
    const sourceQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { sequence_num: 10 }, error: null,
      }),
    }
    sourceQuery.select.mockReturnValue(sourceQuery)
    sourceQuery.eq.mockReturnValue(sourceQuery)
    const previousQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      lt: vi.fn(),
      order: vi.fn(),
      limit: vi.fn().mockResolvedValue({
        data: previous === null ? [] : [previous], error: null,
      }),
    }
    previousQuery.select.mockReturnValue(previousQuery)
    previousQuery.eq.mockReturnValue(previousQuery)
    previousQuery.lt.mockReturnValue(previousQuery)
    previousQuery.order.mockReturnValue(previousQuery)
    let call = 0
    mocks.from.mockImplementation(() => (call++ === 0 ? sourceQuery : previousQuery))
  }

  const begin = () => beginExtractionAttempt({
    userId: actorId,
    modelProvider: 'openai',
    modelId: 'gpt-5.5',
    resolverLabel: 'test',
  })

  beforeEach(() => vi.clearAllMocks())

  it("carries Voyager's preceding turn as context", async () => {
    arrange({
      content: 'Do we want the CubeSat to look outward at space?',
      actor_type: 'voyager',
      actor_id: null as unknown as string,
    })

    const result = await begin()

    expect(result?.sessionContext)
      .toBe('Do we want the CubeSat to look outward at space?')
  })

  it('refuses another person\'s turn as context', async () => {
    // A room session carries other people's messages. Resolving one person's
    // claim against another person's words would cross the audience boundary,
    // so the loader declines rather than truncating or redacting.
    arrange({
      content: 'I think we should look down at Earth instead.',
      actor_type: 'user',
      actor_id: otherPersonId,
    })

    const result = await begin()

    expect(result?.sessionContext).toBeNull()
  })

  it('caps the carried turn so cost stays O(1) per extraction', async () => {
    arrange({
      content: 'x'.repeat(5000),
      actor_type: 'voyager',
      actor_id: null as unknown as string,
    })

    const result = await begin()

    expect(result?.sessionContext).toHaveLength(1201)
    expect(result?.sessionContext?.endsWith('…')).toBe(true)
  })
})
