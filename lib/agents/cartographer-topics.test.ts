import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveUserModelWithMeta: vi.fn(),
  beginExtractionAttempt: vi.fn(),
  completeExtractionAttempt: vi.fn(),
  extractKnowledge: vi.fn(),
  embedCartographerText: vi.fn(),
  embedLegacyTopicInputs: vi.fn(),
  findTopicCandidates: vi.fn(),
  completeMatchedExtraction: vi.fn(),
  runRelationPipeline: vi.fn(),
}))
vi.mock('@/lib/models', () => ({ resolveUserModelWithMeta: mocks.resolveUserModelWithMeta }))
vi.mock('./cartographer/jobs', () => ({
  beginExtractionAttempt: mocks.beginExtractionAttempt,
  completeExtractionAttempt: mocks.completeExtractionAttempt,
}))
vi.mock('./cartographer/extractor', () => ({ extractKnowledge: mocks.extractKnowledge }))
vi.mock('./cartographer/topics', () => ({
  embedCartographerText: mocks.embedCartographerText,
  embedLegacyTopicInputs: mocks.embedLegacyTopicInputs,
  findTopicCandidates: mocks.findTopicCandidates,
}))
vi.mock('./cartographer/topic-pipeline', () => ({
  completeMatchedExtraction: mocks.completeMatchedExtraction,
}))
vi.mock('./cartographer/relation-pipeline', () => ({
  runRelationPipeline: mocks.runRelationPipeline,
}))
vi.mock('./cartographer/apply', () => ({ applyEnrichments: vi.fn() }))
vi.mock('./cartographer/session-decay', () => ({
  applySessionDecay: vi.fn(),
}))
vi.mock('@/lib/knowledge/lifecycle/session-index', () => ({
  upsertPersonSessionIndex: vi.fn(),
}))
vi.mock('./cartographer/preference-superseding', () => ({
  checkPreferenceSuperseding: vi.fn(),
}))
vi.mock('./cartographer/retrieval-feedback', () => ({
  processRetrievalFeedback: vi.fn(),
}))

import { runCartographer } from './cartographer'

const attempt = {
  attemptId: '72000000-0000-4000-8000-000000000001',
  leaseToken: '72000000-0000-4000-8000-000000000002',
  sourceEventId: '72000000-0000-4000-8000-000000000003',
  extractorVersion: 'cartographer-single-claim-v3',
  knowledgeAudienceId: '72000000-0000-4000-8000-000000000004',
  sourceContent: 'Elisheya keeps the amber notebook.',
  sourceEventType: 'message',
  sourceActorId: '72000000-0000-4000-8000-000000000005',
  sourceSessionId: null,
  attemptNumber: 1,
  candidates: [],
}
const core = {
  claim: 'Elisheya keeps the amber notebook.',
  aboutPersonId: null,
  knowledgeType: 'domain' as const,
  attentionScore: 0.8,
  contextSnippet: 'Elisheya keeps the amber notebook.',
}

describe('Cartographer topic contract transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveUserModelWithMeta.mockResolvedValue({
      model: { provider: 'anthropic', modelId: 'claude-sonnet-4-6' },
      label: 'claude-sonnet',
    })
    mocks.beginExtractionAttempt.mockResolvedValue(attempt)
    mocks.embedCartographerText.mockResolvedValue([1, 0])
    mocks.embedLegacyTopicInputs.mockResolvedValue([{
      label: 'amber notebook',
      embedding: '[1,0]',
    }])
    mocks.findTopicCandidates.mockResolvedValue([])
    mocks.completeExtractionAttempt.mockResolvedValue({
      outcome: 'succeeded',
      unitId: '72000000-0000-4000-8000-000000000008',
      replayed: false,
    })
    mocks.completeMatchedExtraction.mockResolvedValue({
      kind: 'completed',
      completion: {
        outcome: 'succeeded',
        unitId: '72000000-0000-4000-8000-000000000008',
        replayed: false,
      },
      usage: { inputTokens: 140, outputTokens: 35 },
    })
    mocks.runRelationPipeline.mockResolvedValue({ kind: 'no_job' })
  })

  it('preserves label-level inputs only for pinned v3 jobs', async () => {
    mocks.extractKnowledge.mockResolvedValue({
      kind: 'structured',
      object: { ...core, topics: ['amber notebook'] },
      inputTokens: 120,
      outputTokens: 30,
    })
    await runCartographer({ userId: attempt.sourceActorId })

    expect(mocks.findTopicCandidates).toHaveBeenCalledOnce()
    expect(mocks.embedLegacyTopicInputs).toHaveBeenCalledWith(['amber notebook'])
    expect(mocks.completeExtractionAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        embedding: '[1,0]',
        topicInputs: [{ label: 'amber notebook', embedding: '[1,0]' }],
      }),
    )
  })

  it.each([
    'cartographer-single-claim-v4',
    'cartographer-single-claim-v5',
  ])('blocks %s only after extraction, on the claim vector', async (version) => {
    const current = { ...attempt, extractorVersion: version }
    mocks.beginExtractionAttempt.mockResolvedValue(current)
    mocks.extractKnowledge.mockResolvedValue({
      kind: 'structured',
      object: core,
      inputTokens: 120,
      outputTokens: 30,
    })
    await runCartographer({ userId: attempt.sourceActorId })

    expect(mocks.embedCartographerText).toHaveBeenCalledOnce()
    expect(mocks.embedCartographerText).toHaveBeenCalledWith(core.claim)
    expect(mocks.findTopicCandidates).not.toHaveBeenCalled()
    expect(mocks.embedLegacyTopicInputs).not.toHaveBeenCalled()
    expect(mocks.completeMatchedExtraction).toHaveBeenCalledWith({
      model: { provider: 'anthropic', modelId: 'claude-sonnet-4-6' },
      attempt: current,
      object: core,
      embedding: '[1,0]',
      embeddingVector: [1, 0],
      extractionUsage: { inputTokens: 120, outputTokens: 30 },
    })
  })
})
