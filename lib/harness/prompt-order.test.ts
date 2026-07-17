import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessHost } from './types'

const streamText = vi.fn()
const composeSystemPrompt = vi.fn()

const loadRunTurn = async () => {
  vi.resetModules()
  vi.doMock('ai', () => ({
    streamText,
    stepCountIs: vi.fn(),
    hasToolCall: vi.fn(),
  }))
  vi.doMock('@/lib/agents/queue', () => ({
    reapStuckTasks: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock('@/lib/agents/cartographer', () => ({
    shouldRunEnrichment: vi.fn(),
    runCartographer: vi.fn(),
  }))
  vi.doMock('@/lib/conversation', () => ({ saveMessage: vi.fn().mockResolvedValue(null) }))
  vi.doMock('@/lib/conversation/window', () => ({
    computeWindow: vi.fn((messages) => ({ messages, hasMoreHistory: false })),
    getTruncatedMessages: vi.fn(() => []),
  }))
  vi.doMock('@/lib/conversation/continuity', () => ({
    detectReferenceSignals: vi.fn(() => []),
    retrieveForContinuity: vi.fn(),
  }))
  vi.doMock('@/lib/debug', () => ({
    log: { api: vi.fn(), memory: vi.fn(), message: vi.fn() },
  }))
  vi.doMock('@/lib/knowledge', () => ({
    createMessageEvent: vi.fn().mockResolvedValue('event-1'),
  }))
  vi.doMock('@/lib/learning/signals', () => ({
    detectLearningSignal: vi.fn(() => null),
    emitSignal: vi.fn(),
  }))
  vi.doMock('@/lib/messaging/deliveries', () => ({ fanOutDeliveries: vi.fn() }))
  vi.doMock('@/lib/messaging/feed-types', () => ({
    isVoyagerAside: vi.fn(() => false),
    stripVoyagerAside: vi.fn((text) => text),
  }))
  vi.doMock('@/lib/messaging/invites', () => ({
    deliverRoomInvite: vi.fn(),
    inviteToRoom: vi.fn(),
  }))
  vi.doMock('@/lib/messaging/room', () => ({
    getRoom: vi.fn().mockResolvedValue({ roomPeople: [], aiPresent: true }),
    parseRoomCommand: vi.fn(() => null),
    removeRoomPerson: vi.fn(),
    setAiPresent: vi.fn(),
  }))
  vi.doMock('@/lib/models', () => ({
    resolveUserModelWithMeta: vi.fn().mockResolvedValue({
      model: { modelId: 'test-model' },
      label: 'claude-sonnet',
      viaConnection: false,
    }),
    creditTracker: { track: vi.fn() },
    modelRouter: { estimateCost: vi.fn() },
  }))
  vi.doMock('@/lib/prompts', () => ({
    composeSystemPrompt,
    getBasePrompt: vi.fn(() => 'BASE'),
  }))
  vi.doMock('@/lib/retrieval', () => ({
    createVoyagerTools: vi.fn(() => ({ tools: {}, registrations: [] })),
    composeToolStrategy: vi.fn(() => 'TOOLS'),
    logRetrievalEvent: vi.fn().mockResolvedValue(null),
    logCitations: vi.fn(),
  }))
  vi.doMock('@/lib/shell/intent', () => ({ detectActionIntent: vi.fn(() => null) }))
  vi.doMock('@/lib/shell/reconciler', () => ({ reconcileActions: vi.fn() }))
  vi.doMock('@/lib/voyage', () => ({
    getVoyageBySlug: vi.fn().mockResolvedValue(null),
    getVoyageMembers: vi.fn().mockResolvedValue([]),
    resolveMemberByName: vi.fn(),
  }))
  return import('./run-turn')
}

describe('harness prompt cache order', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    streamText.mockReturnValue({ toUIMessageStreamResponse: vi.fn() })
    composeSystemPrompt.mockResolvedValue({
      staticPrompt: 'STATIC-CONTENT',
      dynamicPrompt: 'DYNAMIC-CONTENT',
      retrieval: {
        knowledge: [],
        tokenEstimate: 0,
        metadata: {
          threshold: 0,
          pinnedCount: 0,
          searchCount: 0,
          latencyMs: 1,
        },
      },
    })
  })

  it('keeps static cached and prepends dynamic context once to the last raw user message', async () => {
    const { runTurn } = await loadRunTurn()
    const host: HarnessHost = {
      defer: vi.fn(),
      now: () => new Date('2026-07-11T00:00:00.000Z'),
    }

    await runTurn({
      userId: 'user-1',
      conversationId: 'conversation-1',
      voyageSlug: null,
      authState: 'authenticated',
      messages: [
        { role: 'user', content: 'Earlier question' },
        { role: 'assistant', content: 'Earlier answer' },
        { role: 'user', content: 'Current question' },
      ],
      displayName: 'Isaac',
    }, host)

    const [{ messages }] = streamText.mock.calls[0]
    expect(messages.map((message: { role: string }) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ])
    expect(messages[0]).toMatchObject({
      content: 'STATIC-CONTENT\n\nTOOLS',
      providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
    })
    expect(messages[3]).toMatchObject({
      content: '<context>\nDYNAMIC-CONTENT\n</context>\n\nCurrent question',
      providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
    })
    expect(messages[3].content.endsWith('Current question')).toBe(true)
    expect(messages.filter(
      (message: { content: string }) => message.content.includes('DYNAMIC-CONTENT'),
    )).toHaveLength(1)
  })
})

// Omega P2 (2026-07-11): a window can END on an assistant message (resumed
// conversations). The <context> block must still land on the LAST USER message
// (mid-history), exactly once, with cache control on the true last message.
it('injects context onto the last USER message even when the window ends on an assistant turn', async () => {
  const { runTurn } = await loadRunTurn()
  const host: HarnessHost = {
    defer: vi.fn(),
    now: () => new Date('2026-07-11T00:00:00.000Z'),
  }

  await runTurn({
    userId: 'user-1',
    conversationId: 'conversation-1',
    voyageSlug: null,
    authState: 'authenticated',
    autoSent: false,
    messages: [
      { role: 'user', content: 'Earlier question' },
      { role: 'user', content: 'Current question' },
      { role: 'assistant', content: 'Trailing assistant answer' },
    ],
    displayName: 'Isaac',
  }, host)

  const [{ messages }] = streamText.mock.calls.at(-1)!
  const users = messages.filter((m: { role: string }) => m.role === 'user')
  const lastUser = users.at(-1) as { content: string }
  // context on the last USER message, raw text preserved after it
  expect(lastUser.content).toContain('<context>')
  expect(lastUser.content).toContain('Current question')
  // exactly once across the whole array
  const occurrences = messages.filter((m: { content?: string }) =>
    typeof m.content === 'string' && m.content.includes('<context>')).length
  expect(occurrences).toBe(1)
  // trailing assistant message untouched
  const last = messages.at(-1) as { role: string; content: string }
  expect(last.role).toBe('assistant')
  expect(last.content).toBe('Trailing assistant answer')
})
