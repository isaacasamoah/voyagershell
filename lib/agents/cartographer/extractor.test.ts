import { createHash } from 'node:crypto'
import type { LanguageModel } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ generateObject: vi.fn() }))

vi.mock('ai', () => ({ generateObject: mocks.generateObject }))

import { extractKnowledge, rederiveKnowledgeUnit } from './extractor'
import { V5_CARTOGRAPHER_PROMPT } from './contract'
import type {
  ExtractionAttempt,
  TopicBackfillUnit,
  TopicCandidate,
} from './types'

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
  sessionContext: null,
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

  it('keeps the pinned v3 candidate prompt exact while it drains', async () => {
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

  it('keeps the superseded v4 prompt byte-stable now that v5 is current', async () => {
    await extractKnowledge({} as LanguageModel, {
      ...attempt,
      extractorVersion: 'cartographer-single-claim-v4',
    }, topics)

    expect(mocks.generateObject.mock.calls[0][0].messages).toEqual([{
      role: 'user',
      content: historicalPrompt,
    }])
    expect(mocks.generateObject.mock.calls[0][0].system).not.toContain(
      'ordered procedure',
    )
  })

  it('routes the runtime-current v5 to the durability and ordered type contract', async () => {
    await extractKnowledge({} as LanguageModel, {
      ...attempt,
      extractorVersion: 'cartographer-single-claim-v5',
    }, topics)

    const system = mocks.generateObject.mock.calls[0][0].system as string
    const preference = system.indexOf('1. preference')
    const operational = system.indexOf('2. operational')
    const domain = system.indexOf('3. domain')
    expect(system).toContain('asserts the absence of a settled fact')
    expect(system).toContain('greetings, thanks, acknowledgements')
    expect(system).toMatch(/promise to\s+say something later/)
    expect(system).toContain('classify what the claim asserts')
    expect(preference).toBeGreaterThan(-1)
    expect(preference).toBeLessThan(operational)
    expect(operational).toBeLessThan(domain)
  })

  it('keeps topic candidates out of the v5 user prompt', async () => {
    await extractKnowledge({} as LanguageModel, {
      ...attempt,
      extractorVersion: 'cartographer-single-claim-v5',
    }, topics)

    // v5 asks for one claim only. Topics are assigned by the separate matcher
    // stage, so offering topic candidates here would invite a field the v5
    // schema does not carry.
    expect(mocks.generateObject.mock.calls[0][0].messages).toEqual([{
      role: 'user',
      content: historicalPrompt,
    }])
  })

  it('keeps the measured v5 prompt byte-stable after the one-shot result', () => {
    expect(createHash('sha256').update(V5_CARTOGRAPHER_PROMPT).digest('hex'))
      .toBe('3ae9be74c09f0284034a5baddee82672a672e6006baa796c879f9baa425b4ce2')
  })

  it('re-derives immutable unit physics without reopening topic labels', async () => {
    const unit: TopicBackfillUnit = {
      unitId: '72000000-0000-4000-8000-000000000010',
      sourceEventId: attempt.sourceEventId,
      sourceContent: attempt.sourceContent,
      sourceActorId: attempt.sourceActorId,
      claim: 'Elisheya keeps the amber notebook.',
      knowledgeAudienceId: attempt.knowledgeAudienceId,
      embedding: null,
    }

    await rederiveKnowledgeUnit({} as LanguageModel, unit)

    const prompt = mocks.generateObject.mock.calls[0][0].messages[0].content
    const system = mocks.generateObject.mock.calls[0][0].system as string
    expect(prompt).not.toMatch(/topic/i)
    expect(prompt).toContain(unit.claim)
    expect(system).not.toContain('ordered procedure')
  })
})
