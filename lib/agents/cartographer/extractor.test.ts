import type { LanguageModel } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ generateObject: vi.fn() }))

vi.mock('ai', () => ({ generateObject: mocks.generateObject }))

import { extractKnowledge } from './extractor'
import type { ExtractionAttempt, TopicCandidate } from './types'

const attempt: ExtractionAttempt = {
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
const topics: TopicCandidate[] = [{
  topicId: '72000000-0000-4000-8000-000000000008',
  label: 'amber notebook',
  similarity: 0.91,
}]
const historicalPrompt = `## Immutable source event
${JSON.stringify({
    eventId: attempt.sourceEventId,
    eventType: attempt.sourceEventType,
    actorPersonId: attempt.sourceActorId,
    content: attempt.sourceContent,
  })}

## Allowed Person candidates
${JSON.stringify(attempt.candidates)}

Return the structured Cartographer result.`

describe('Cartographer extractor prompt versioning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateObject.mockResolvedValue({
      object: {
        claim: null,
        aboutPersonId: null,
        knowledgeType: 'domain',
        attentionScore: 0,
        contextSnippet: 'No durable claim.',
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    })
  })

  it.each([
    'cartographer-single-claim-v1',
    'cartographer-single-claim-v2',
  ])('sends %s the exact pre-K4b user prompt', async (extractorVersion) => {
    await extractKnowledge({} as LanguageModel, { ...attempt, extractorVersion }, topics)

    expect(mocks.generateObject).toHaveBeenCalledWith(expect.objectContaining({
      messages: [{ role: 'user', content: historicalPrompt }],
    }))
  })

  it('adds topic candidates only to the complete v3 user prompt', async () => {
    await extractKnowledge({} as LanguageModel, {
      ...attempt,
      extractorVersion: 'cartographer-single-claim-v3',
    }, topics)

    const call = mocks.generateObject.mock.calls[0][0]
    expect(call.messages).toEqual([{
      role: 'user',
      content: `${historicalPrompt.replace(
        '\n\nReturn the structured Cartographer result.',
        `\n\n## Existing topic candidates\n${JSON.stringify(topics)}`,
      )}\n\nReturn the structured Cartographer result.`,
    }])
  })
})
