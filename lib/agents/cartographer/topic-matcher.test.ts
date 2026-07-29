import type { LanguageModel } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TOPIC_MATCHER_PROMPT,
  TOPIC_MATCHER_VERSION,
  topicMatcherSchema,
} from './contract'

const mocks = vi.hoisted(() => ({ generateObject: vi.fn() }))
vi.mock('ai', () => ({ generateObject: mocks.generateObject }))

import { matchKnowledgeTopics } from './topic-matcher'

describe('topic identity matcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateObject.mockResolvedValue({
      object: {
        topics: [{
          kind: 'existing',
          topicId: '72000000-0000-4000-8000-000000000008',
        }],
      },
      usage: { inputTokens: 20, outputTokens: 5 },
    })
  })

  it('binds the retrieval wording to an explicit matcher version', async () => {
    expect(TOPIC_MATCHER_VERSION).toBe('topic-retrieval-v4')
    expect(TOPIC_MATCHER_PROMPT).toContain(
      'if the person went looking for one',
    )
    expect(TOPIC_MATCHER_PROMPT).toContain('Precision matters more than recall')
    expect(TOPIC_MATCHER_PROMPT).not.toMatch(/worked examples|few[- ]shot/i)

    await matchKnowledgeTopics({} as LanguageModel, 'The QE work shipped.', [{
      topicId: '72000000-0000-4000-8000-000000000008',
      label: 'quantum engines',
      representativeClaim: 'Quantum propulsion research is next quarter.',
      similarity: 0.44,
    }])

    const call = mocks.generateObject.mock.calls[0][0]
    expect(call.system).toBe(TOPIC_MATCHER_PROMPT)
    expect(call.messages[0].content).toContain('"topicId"')
    expect(call.messages[0].content).toContain('"representativeClaim"')
    expect(call.messages[0].content).not.toContain('"similarity"')
  })

  it('accepts only candidate reuse or a bounded new-label proposal', () => {
    expect(topicMatcherSchema.safeParse({
      topics: [{ kind: 'existing', topicId: '72000000-0000-4000-8000-000000000008' }],
    }).success).toBe(true)
    expect(topicMatcherSchema.safeParse({
      topics: [{ kind: 'new', label: 'quantum engines' }],
    }).success).toBe(true)
    expect(topicMatcherSchema.safeParse({
      topics: [{ kind: 'existing', topicId: 'not-a-uuid' }],
    }).success).toBe(false)
    expect(topicMatcherSchema.safeParse({
      topics: [
        { kind: 'new', label: 'one' },
        { kind: 'new', label: 'two' },
        { kind: 'new', label: 'three' },
        { kind: 'new', label: 'four' },
      ],
    }).success).toBe(false)
  })
})
