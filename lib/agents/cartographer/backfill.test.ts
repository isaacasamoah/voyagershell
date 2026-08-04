import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  runCartographer: vi.fn(),
  resolveUserModelWithMeta: vi.fn(),
  rederiveKnowledgeUnit: vi.fn(),
  findTopicCandidates: vi.fn(),
  matchKnowledgeTopics: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}))
vi.mock('@/lib/agents/cartographer', () => ({
  runCartographer: mocks.runCartographer,
}))
vi.mock('@/lib/models', () => ({
  resolveUserModelWithMeta: mocks.resolveUserModelWithMeta,
}))
vi.mock('./extractor', () => ({
  rederiveKnowledgeUnit: mocks.rederiveKnowledgeUnit,
}))
vi.mock('./topics', () => ({
  embedCartographerText: vi.fn(),
  findTopicCandidates: mocks.findTopicCandidates,
  parseVectorString: () => [1, 0],
  toTopicCandidateSnapshot: () => [],
  toTopicWriteInputs: (topics: unknown) => topics,
}))
vi.mock('./topic-matcher', () => ({
  matchKnowledgeTopics: mocks.matchKnowledgeTopics,
}))

import { runTopicBackfill } from './backfill'
import { TOPIC_BACKFILL_RETRY_EXHAUSTED } from './topic-retry'

const unit = {
  unit_id: '72000000-0000-4000-8000-000000000001',
  source_event_id: '72000000-0000-4000-8000-000000000002',
  source_content: 'The QE work shipped.',
  source_actor_id: '72000000-0000-4000-8000-000000000003',
  claim: 'The QE work shipped.',
  knowledge_audience_id: '72000000-0000-4000-8000-000000000004',
  embedding: '[1,0]',
}

describe('topic backfill recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveUserModelWithMeta.mockResolvedValue({ model: {} })
    mocks.rederiveKnowledgeUnit.mockResolvedValue({
      kind: 'structured',
      object: {
        claim: unit.claim,
        aboutPersonId: null,
        knowledgeType: 'domain',
        attentionScore: 0.8,
        contextSnippet: unit.claim,
      },
    })
    mocks.findTopicCandidates.mockResolvedValue([])
    mocks.matchKnowledgeTopics.mockResolvedValue({
      kind: 'structured',
      topics: [{ kind: 'new', label: 'the qe work' }],
    })
  })

  it('caps retryable identity writes during pre-v4 re-derivation', async () => {
    let unitLists = 0
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'activate_knowledge_topic_contract') {
        return Promise.resolve({ data: 'cartographer-single-claim-v6', error: null })
      }
      if (name === 'list_knowledge_topic_backfill_jobs') {
        return Promise.resolve({ data: [], error: null })
      }
      if (name === 'list_knowledge_topic_backfill_units') {
        unitLists++
        return Promise.resolve({ data: unitLists === 1 ? [unit] : [], error: null })
      }
      if (name === 'write_knowledge_topic_identity_backfill') {
        return Promise.resolve({
          data: null,
          error: { message: 'knowledge_topic_candidate_not_authorized' },
        })
      }
      throw new Error(`unexpected_rpc:${name}`)
    })

    await expect(runTopicBackfill())
      .rejects.toThrow(TOPIC_BACKFILL_RETRY_EXHAUSTED)
    expect(mocks.findTopicCandidates).toHaveBeenCalledTimes(5)
    expect(mocks.matchKnowledgeTopics).toHaveBeenCalledTimes(5)
    expect(mocks.rpc).toHaveBeenCalledTimes(8)
  })

  it.each([
    { label: 'no-job', result: { kind: 'no_job' as const } },
    {
      label: 'relation completion',
      result: {
        kind: 'relation_completed' as const,
        outcome: 'succeeded',
        unitId: '72000000-0000-4000-8000-000000000009',
        edgeIds: [],
      },
    },
  ])('re-lists when a $label leaves the old extraction job terminal', async ({
    result: cartographerResult,
  }) => {
    let jobLists = 0
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'activate_knowledge_topic_contract') {
        return Promise.resolve({ data: 'cartographer-single-claim-v6', error: null })
      }
      if (name === 'list_knowledge_topic_backfill_jobs') {
        jobLists++
        return Promise.resolve({
          data: jobLists === 1
            ? [{
              source_event_id: unit.source_event_id,
              requesting_user_id: unit.source_actor_id,
            }]
            : [],
          error: null,
        })
      }
      if (name === 'list_knowledge_topic_backfill_units') {
        return Promise.resolve({ data: [], error: null })
      }
      if (name === 'assert_knowledge_topic_backfill_complete') {
        return Promise.resolve({ data: { oldNonTerminalJobs: 0 }, error: null })
      }
      throw new Error(`unexpected_rpc:${name}`)
    })
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      neq: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.neq.mockResolvedValue({
      data: [{ state: 'succeeded', lease_expires_at: null }],
      error: null,
    })
    mocks.from.mockReturnValue(query)
    mocks.runCartographer.mockResolvedValue(cartographerResult)

    const result = await runTopicBackfill()

    expect(result.drainedJobs).toBe(0)
    expect(mocks.runCartographer).toHaveBeenCalledOnce()
    expect(query.eq).toHaveBeenCalledWith('source_event_id', unit.source_event_id)
  })
})
