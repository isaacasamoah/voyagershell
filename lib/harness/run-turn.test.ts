import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessHost, TurnContext } from './types'

const streamText = vi.fn()
const reapStuckTasks = vi.fn()
const composeContextFromStream = vi.fn()
const createMessageEvent = vi.fn()
const fanOutDeliveries = vi.fn()
const deliverRoomInvite = vi.fn()
const inviteToRoom = vi.fn()
const getRoom = vi.fn()
const parseRoomCommand = vi.fn()
const removeRoomPerson = vi.fn()
const setAiPresent = vi.fn()
const getVoyageBySlug = vi.fn()
const getVoyageMembers = vi.fn()
const resolveMemberByName = vi.fn()
const composeSystemPrompt = vi.fn()
const createVoyagerTools = vi.fn()
const composeToolStrategy = vi.fn()
const logRetrievalEvent = vi.fn()
const resolveUserModelWithMeta = vi.fn()
const retrieveForContinuity = vi.fn()
const emitSignal = vi.fn()
const creditTrack = vi.fn()
const estimateCost = vi.fn()

const streamResult = { toUIMessageStreamResponse: vi.fn() }

const loadRunTurn = async () => {
  vi.resetModules()
  vi.doMock('ai', () => ({
    streamText,
    stepCountIs: vi.fn((count) => ({ count })),
    hasToolCall: vi.fn((name) => ({ name })),
  }))
  vi.doMock('@/lib/agents/queue', () => ({ reapStuckTasks }))
  vi.doMock('@/lib/agents/cartographer', () => ({
    shouldRunEnrichment: vi.fn(),
    runCartographer: vi.fn(),
  }))
  vi.doMock('@/lib/conversation', () => ({ composeContextFromStream }))
  vi.doMock('@/lib/conversation/window', () => ({
    computeWindow: vi.fn((messages) => ({ messages, hasMoreHistory: false })),
    getTruncatedMessages: vi.fn(() => []),
  }))
  vi.doMock('@/lib/conversation/continuity', () => ({
    detectReferenceSignals: vi.fn(() => []),
    retrieveForContinuity,
  }))
  vi.doMock('@/lib/debug', () => ({
    log: {
      api: vi.fn(),
      memory: vi.fn(),
      message: vi.fn(),
    },
  }))
  vi.doMock('@/lib/knowledge', () => ({ createMessageEvent }))
  vi.doMock('@/lib/learning/signals', () => ({
    detectLearningSignal: vi.fn(() => null),
    emitSignal,
  }))
  vi.doMock('@/lib/messaging/deliveries', () => ({ fanOutDeliveries }))
  vi.doMock('@/lib/messaging/feed-types', () => ({
    isVoyagerAside: (text: string) => /^@voyager\b/i.test(text.trim()),
    stripVoyagerAside: (text: string) => text
      .trim()
      .replace(/^@voyager[\s,:!.?-]*/i, '')
      .trim(),
  }))
  vi.doMock('@/lib/messaging/invites', () => ({
    deliverRoomInvite,
    inviteToRoom,
  }))
  vi.doMock('@/lib/messaging/room', () => ({
    getRoom,
    parseRoomCommand,
    removeRoomPerson,
    setAiPresent,
  }))
  vi.doMock('@/lib/models', () => ({
    resolveUserModelWithMeta,
    creditTracker: { track: creditTrack },
    modelRouter: { estimateCost },
  }))
  vi.doMock('@/lib/prompts', () => ({
    composeSystemPrompt,
    getBasePrompt: vi.fn(() => 'BASE'),
  }))
  vi.doMock('@/lib/retrieval', () => ({
    createVoyagerTools,
    composeToolStrategy,
    logRetrievalEvent,
    logCitations: vi.fn(),
  }))
  vi.doMock('@/lib/shell/intent', () => ({ detectActionIntent: vi.fn(() => null) }))
  vi.doMock('@/lib/shell/reconciler', () => ({ reconcileActions: vi.fn() }))
  vi.doMock('@/lib/voyage', () => ({
    getVoyageBySlug,
    getVoyageMembers,
    resolveMemberByName,
  }))
  return import('./run-turn')
}

const context = (overrides: Partial<TurnContext> = {}): TurnContext => ({
  userId: 'user-1',
  conversationId: 'conversation-1',
  voyageSlug: null,
  authState: 'authenticated',
  autoSent: false,
  newMessage: 'Hello Voyager',
  displayName: 'Isaac',
  ...overrides,
})

const stubHost = () => {
  const deferred: Promise<unknown>[] = []
  const host: HarnessHost = {
    defer: (promise) => deferred.push(promise),
    now: () => new Date('2026-07-11T00:00:00.000Z'),
  }
  return { host, deferred }
}

describe('runTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    streamText.mockReturnValue(streamResult)
    reapStuckTasks.mockResolvedValue(undefined)
    composeContextFromStream.mockResolvedValue([])
    createMessageEvent.mockResolvedValue('event-1')
    fanOutDeliveries.mockResolvedValue(undefined)
    getRoom.mockResolvedValue({ roomPeople: [], aiPresent: true })
    parseRoomCommand.mockReturnValue(null)
    getVoyageBySlug.mockResolvedValue(null)
    getVoyageMembers.mockResolvedValue([])
    composeSystemPrompt.mockResolvedValue({
      staticPrompt: 'STATIC',
      dynamicPrompt: 'DYNAMIC',
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
    createVoyagerTools.mockReturnValue({ tools: {}, registrations: [] })
    composeToolStrategy.mockReturnValue('TOOLS')
    logRetrievalEvent.mockResolvedValue('retrieval-1')
    resolveUserModelWithMeta.mockResolvedValue({
      model: { modelId: 'test-model' },
      label: 'claude-sonnet',
      viaConnection: false,
    })
  })

  it('runs a solo turn headlessly and defers user event emission', async () => {
    const { runTurn } = await loadRunTurn()
    const { host, deferred } = stubHost()

    const result = await runTurn(context(), host)

    expect(result).toEqual({ kind: 'stream', result: streamResult })
    expect(streamText).toHaveBeenCalledOnce()
    expect(createMessageEvent).toHaveBeenCalledWith(
      'conversation-1',
      'user',
      'Hello Voyager',
      expect.objectContaining({ eventType: 'conversation' }),
    )
    expect(deferred).toHaveLength(2)
    await Promise.all(deferred)
  })

  it('resolves +name as a deterministic room invitation without a model turn', async () => {
    parseRoomCommand.mockReturnValue({ op: 'add', name: 'vanessa' })
    getVoyageBySlug.mockResolvedValue({ id: 'voyage-1' })
    getVoyageMembers.mockResolvedValue([
      { userId: 'user-1', displayName: 'Isaac' },
      { userId: 'user-2', displayName: 'Vanessa' },
    ])
    resolveMemberByName.mockReturnValue({ userId: 'user-2', displayName: 'Vanessa' })
    inviteToRoom.mockResolvedValue({ state: 'invited', spaceId: 'space-1' })
    deliverRoomInvite.mockResolvedValue(undefined)
    const { runTurn } = await loadRunTurn()

    const result = await runTurn(context({
      voyageSlug: 'launch',
      newMessage: '+vanessa',
    }), stubHost().host)

    expect(result).toEqual({
      kind: 'text',
      text: 'Invited Vanessa — they can hop in by replying to the invite.',
    })
    expect(deliverRoomInvite).toHaveBeenCalledWith(
      'conversation-1',
      { userId: 'user-1', displayName: 'Isaac' },
      'user-2',
      'launch',
    )
    expect(streamText).not.toHaveBeenCalled()
  })

  it('fans out an unaddressed room message and returns empty', async () => {
    getRoom.mockResolvedValue({ roomPeople: ['user-2'], aiPresent: true })
    getVoyageBySlug.mockResolvedValue({ id: 'voyage-1' })
    getVoyageMembers.mockResolvedValue([
      { userId: 'user-1', displayName: 'Isaac' },
      { userId: 'user-2', displayName: 'Vanessa' },
    ])
    const { runTurn } = await loadRunTurn()

    const result = await runTurn(context({
      voyageSlug: 'launch',
      newMessage: 'The fix is ready',
    }), stubHost().host)

    expect(result).toEqual({ kind: 'empty' })
    expect(fanOutDeliveries).toHaveBeenCalledWith('event-1', ['user-2'])
    expect(streamText).not.toHaveBeenCalled()
  })

  it('treats an @voyager room aside as a private model turn', async () => {
    getRoom.mockResolvedValue({ roomPeople: ['user-2'], aiPresent: false })
    getVoyageBySlug.mockResolvedValue({ id: 'voyage-1' })
    getVoyageMembers.mockResolvedValue([
      { userId: 'user-1', displayName: 'Isaac' },
      { userId: 'user-2', displayName: 'Vanessa' },
    ])
    const { runTurn } = await loadRunTurn()

    const result = await runTurn(context({
      voyageSlug: 'launch',
      newMessage: '@voyager help me think',
    }), stubHost().host)

    expect(result.kind).toBe('stream')
    expect(streamText).toHaveBeenCalledOnce()
    expect(fanOutDeliveries).not.toHaveBeenCalled()
    expect(createMessageEvent).toHaveBeenCalledWith(
      'conversation-1',
      'user',
      'help me think',
      expect.objectContaining({ eventType: 'conversation' }),
    )
  })

  it('does not persist the synthetic auto-sent welcome', async () => {
    const { runTurn } = await loadRunTurn()

    const result = await runTurn(context({
      autoSent: true,
      newMessage: 'good morning',
    }), stubHost().host)

    expect(result.kind).toBe('stream')
    expect(createMessageEvent).not.toHaveBeenCalled()
  })

  it('uses the resolved default model label for cost estimation', async () => {
    const { runTurn } = await loadRunTurn()
    await runTurn(context(), stubHost().host)
    const onFinish = streamText.mock.calls[0][0].onFinish

    await onFinish({
      text: '',
      steps: [],
      finishReason: 'stop',
      usage: { inputTokens: 120, outputTokens: 30 },
      providerMetadata: {},
    })

    expect(estimateCost).toHaveBeenCalledWith('claude-sonnet', 120, 30)
  })
})
