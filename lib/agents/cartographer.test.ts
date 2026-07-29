import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveUserModelWithMeta: vi.fn(),
  beginExtractionAttempt: vi.fn(),
  completeExtractionAttempt: vi.fn(),
  extractKnowledge: vi.fn(),
  applyEnrichments: vi.fn(),
  upsertSessionIndex: vi.fn(),
  applySessionDecay: vi.fn(),
  checkPreferenceSuperseding: vi.fn(),
  processRetrievalFeedback: vi.fn(),
  embedCartographerText: vi.fn(),
  embedTopicInputs: vi.fn(),
  findTopicCandidates: vi.fn(),
}))

vi.mock('@/lib/models', () => ({
  resolveUserModelWithMeta: mocks.resolveUserModelWithMeta,
}))
vi.mock('./cartographer/jobs', () => ({
  beginExtractionAttempt: mocks.beginExtractionAttempt,
  completeExtractionAttempt: mocks.completeExtractionAttempt,
}))
vi.mock('./cartographer/extractor', () => ({
  extractKnowledge: mocks.extractKnowledge,
}))
vi.mock('./cartographer/apply', () => ({
  applyEnrichments: mocks.applyEnrichments,
}))
vi.mock('./cartographer/session-decay', () => ({
  upsertSessionIndex: mocks.upsertSessionIndex,
  applySessionDecay: mocks.applySessionDecay,
}))
vi.mock('./cartographer/preference-superseding', () => ({
  checkPreferenceSuperseding: mocks.checkPreferenceSuperseding,
}))
vi.mock('./cartographer/retrieval-feedback', () => ({
  processRetrievalFeedback: mocks.processRetrievalFeedback,
}))
vi.mock('./cartographer/topics', () => ({
  embedCartographerText: mocks.embedCartographerText,
  embedTopicInputs: mocks.embedTopicInputs,
  findTopicCandidates: mocks.findTopicCandidates,
}))

import { runCartographer } from './cartographer'

const attempt = {
  attemptId: '72000000-0000-4000-8000-000000000001',
  leaseToken: '72000000-0000-4000-8000-000000000002',
  sourceEventId: '72000000-0000-4000-8000-000000000003',
  extractorVersion: 'cartographer-single-claim-v1',
  knowledgeAudienceId: '72000000-0000-4000-8000-000000000004',
  sourceContent: 'Elisheya keeps the amber notebook.',
  sourceEventType: 'message',
  sourceActorId: '72000000-0000-4000-8000-000000000005',
  sourceSessionId: '72000000-0000-4000-8000-000000000006',
  attemptNumber: 1,
  candidates: [{
    personId: '72000000-0000-4000-8000-000000000007',
    displayName: 'Elisheya',
  }],
}

describe('event-owned Cartographer extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveUserModelWithMeta.mockResolvedValue({
      model: { provider: 'anthropic', modelId: 'claude-sonnet-4-6' },
      label: 'claude-sonnet',
      viaConnection: false,
    })
    mocks.beginExtractionAttempt.mockResolvedValue(attempt)
    mocks.extractKnowledge.mockResolvedValue({
      kind: 'structured',
      object: {
        claim: 'Elisheya keeps the amber notebook.',
        aboutPersonId: attempt.candidates[0].personId,
        knowledgeType: 'domain',
        attentionScore: 0.8,
        contextSnippet: 'Elisheya keeps the amber notebook.',
      },
      inputTokens: 120,
      outputTokens: 30,
    })
    mocks.completeExtractionAttempt.mockResolvedValue({
      outcome: 'succeeded',
      unitId: '72000000-0000-4000-8000-000000000008',
      replayed: false,
    })
    mocks.applySessionDecay.mockResolvedValue({ decayed: 0, skipped: 0 })
    mocks.processRetrievalFeedback.mockResolvedValue({ promoted: 0 })
    mocks.embedCartographerText.mockResolvedValue([1, 0])
    mocks.embedTopicInputs.mockResolvedValue([{
      label: 'amber notebook',
      embedding: '[1,0]',
    }])
    mocks.findTopicCandidates.mockResolvedValue([])
  })

  it('records concrete model identity and completes one exact source job', async () => {
    const result = await runCartographer({
      userId: attempt.sourceActorId,
      sourceEventId: attempt.sourceEventId,
    })

    expect(mocks.beginExtractionAttempt).toHaveBeenCalledWith({
      userId: attempt.sourceActorId,
      sourceEventId: attempt.sourceEventId,
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      resolverLabel: 'claude-sonnet',
    })
    expect(mocks.completeExtractionAttempt).toHaveBeenCalledWith(expect.objectContaining({
      attempt,
      result: 'succeeded',
      claim: 'Elisheya keeps the amber notebook.',
      aboutPersonId: attempt.candidates[0].personId,
      inputTokens: 120,
      outputTokens: 30,
    }))
    expect(mocks.completeExtractionAttempt.mock.calls[0][0].knowledgeType).toBeUndefined()
    expect(mocks.completeExtractionAttempt.mock.calls[0][0].embedding).toBeUndefined()
    expect(mocks.applyEnrichments).toHaveBeenCalledOnce()
    expect(result).toEqual({
      kind: 'completed',
      outcome: 'succeeded',
      sourceEventId: attempt.sourceEventId,
      unitId: '72000000-0000-4000-8000-000000000008',
    })
  })

  it('records unknown provider usage as unknown, never as zero tokens', async () => {
    mocks.extractKnowledge.mockResolvedValue({
      kind: 'structured',
      object: {
        claim: 'Elisheya keeps the amber notebook.',
        aboutPersonId: attempt.candidates[0].personId,
        knowledgeType: 'domain',
        attentionScore: 0.8,
        contextSnippet: 'Elisheya keeps the amber notebook.',
      },
      inputTokens: undefined,
      outputTokens: undefined,
    })

    await runCartographer({
      userId: attempt.sourceActorId,
      sourceEventId: attempt.sourceEventId,
    })

    const completion = mocks.completeExtractionAttempt.mock.calls[0][0]
    expect(completion.inputTokens).toBeUndefined()
    expect(completion.outputTokens).toBeUndefined()
  })

  it('fails closed before leasing when concrete model identity is absent', async () => {
    mocks.resolveUserModelWithMeta.mockResolvedValue({
      model: { provider: '', modelId: '' },
      label: 'unknown',
      viaConnection: false,
    })

    expect(await runCartographer({ userId: attempt.sourceActorId }))
      .toEqual({ kind: 'model_identity_unavailable' })
    expect(mocks.beginExtractionAttempt).not.toHaveBeenCalled()
  })

  it('records provider failure and leaves mutable enrichment untouched', async () => {
    mocks.extractKnowledge.mockResolvedValue({
      kind: 'failed',
      failure: 'provider_failed',
      errorClass: 'APICallError',
    })
    mocks.completeExtractionAttempt.mockResolvedValue({
      outcome: 'provider_failed',
      unitId: null,
      replayed: false,
    })

    const result = await runCartographer({ userId: attempt.sourceActorId })

    expect(mocks.completeExtractionAttempt).toHaveBeenCalledWith({
      attempt,
      result: 'provider_failed',
      errorClass: 'APICallError',
    })
    expect(mocks.applyEnrichments).not.toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({
      kind: 'completed',
      outcome: 'provider_failed',
    }))
  })

  it('embeds and resolves bounded topic proposals only for v3 jobs', async () => {
    mocks.beginExtractionAttempt.mockResolvedValue({
      ...attempt,
      extractorVersion: 'cartographer-single-claim-v3',
    })
    mocks.extractKnowledge.mockResolvedValue({
      kind: 'structured',
      object: {
        claim: 'Elisheya keeps the amber notebook.',
        aboutPersonId: null,
        knowledgeType: 'domain',
        attentionScore: 0.8,
        contextSnippet: 'Elisheya keeps the amber notebook.',
        topics: ['amber notebook'],
      },
      inputTokens: 120,
      outputTokens: 30,
    })

    await runCartographer({ userId: attempt.sourceActorId })

    expect(mocks.findTopicCandidates).toHaveBeenCalledOnce()
    expect(mocks.embedTopicInputs).toHaveBeenCalledWith(['amber notebook'])
    expect(mocks.completeExtractionAttempt).toHaveBeenCalledWith(expect.objectContaining({
      knowledgeType: 'domain',
      attentionScore: 0.8,
      embedding: '[1,0]',
      topicInputs: [{ label: 'amber notebook', embedding: '[1,0]' }],
    }))
  })
})
