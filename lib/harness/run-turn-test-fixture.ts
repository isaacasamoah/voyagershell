import { vi } from 'vitest'
import type { HarnessHost, TurnContext } from './types'

const streamText = vi.fn()
const reapStuckTasks = vi.fn()
const composeContextFromStream = vi.fn()
const renderMessagesForModel = vi.fn((messages) => messages)
const createMessageEvent = vi.fn()
const claimSourceIngress = vi.fn()
const enrichNewIngress = vi.fn()
const deliverRoomInvite = vi.fn()
const inviteToRoom = vi.fn()
const getRoom = vi.fn()
const parseRoomCommand = vi.fn()
const removeRoomPerson = vi.fn()
const setAiPresent = vi.fn()
const getVoyageBySlug = vi.fn()
const getVoyageMembers = vi.fn()
const resolveMemberByName = vi.fn()
const getOwnVoyagerIdentity = vi.fn()
const composeSystemPrompt = vi.fn()
const createVoyagerTools = vi.fn()
const composeToolStrategy = vi.fn()
const logRetrievalEvent = vi.fn()
const resolveUserModelWithMeta = vi.fn()
const retrieveForContinuity = vi.fn()
const emitSignal = vi.fn()
const creditTrack = vi.fn()
const estimateCost = vi.fn()

export const streamResult = {
  toUIMessageStreamResponse: vi.fn(),
  consumeStream: vi.fn(),
}

export const runTurnMocks = {
  claimSourceIngress,
  composeSystemPrompt,
  createMessageEvent,
  deliverRoomInvite,
  estimateCost,
  getOwnVoyagerIdentity,
  getRoom,
  getVoyageBySlug,
  getVoyageMembers,
  inviteToRoom,
  parseRoomCommand,
  resolveMemberByName,
  resolveUserModelWithMeta,
  streamText,
}

const applyHarnessMocks = () => {
  vi.doMock('@/lib/agents/queue', () => ({ reapStuckTasks }))
  vi.doMock('@/lib/agents/cartographer', () => ({
    runCartographer: vi.fn(),
  }))
  vi.doMock('@/lib/agents/cartographer/source', () => ({
    shouldRunEnrichment: vi.fn(),
  }))
  vi.doMock('@/lib/conversation/stream-context', () => ({
    composeContextFromStream,
    renderMessagesForModel,
  }))
  vi.doMock('@/lib/conversation/window', () => ({
    computeWindow: vi.fn((messages) => ({ messages, hasMoreHistory: false })),
    getTruncatedMessages: vi.fn(() => []),
  }))
  vi.doMock('@/lib/conversation/continuity', () => ({
    detectReferenceSignals: vi.fn(() => []),
    retrieveForContinuity,
  }))
  vi.doMock('@/lib/debug', () => ({
    log: { api: vi.fn(), memory: vi.fn(), message: vi.fn() },
  }))
  vi.doMock('@/lib/knowledge', () => ({ createMessageEvent }))
  vi.doMock('@/lib/learning/signals', () => ({
    detectLearningSignal: vi.fn(() => null),
    emitSignal,
  }))
  vi.doMock('@/lib/messaging/handles', () => ({ getOwnVoyagerIdentity }))
  // The claim is a real class boundary: runTurn distinguishes a payload conflict
  // from any other failure with instanceof, so the stub must export a real class.
  vi.doMock('@/lib/messaging/ingress', () => ({
    claimSourceIngress,
    enrichNewIngress,
    IngressConflictError: class IngressConflictError extends Error {},
  }))
  vi.doMock('@/lib/messaging/invites', () => ({
    deliverRoomInvite,
    inviteToRoom,
  }))
  vi.doMock('@/lib/messaging/room', () => ({
    getRoom,
    removeRoomPerson,
    setAiPresent,
  }))
  vi.doMock('@/lib/messaging/room-command', () => ({ parseRoomCommand }))
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
  vi.doMock('@/lib/shell/intent', () => ({
    detectActionIntent: vi.fn(() => null),
  }))
  vi.doMock('@/lib/shell/reconciler', () => ({
    reconcileActions: vi.fn(),
  }))
  vi.doMock('@/lib/voyage/core', () => ({
    getVoyageBySlug,
  }))
  vi.doMock('@/lib/voyage/members', () => ({
    getVoyageMembers,
    resolveMemberByName,
  }))
}

export const loadRunTurn = async () => {
  vi.resetModules()
  vi.doMock('ai', () => ({
    streamText,
    stepCountIs: vi.fn((count) => ({ count })),
    hasToolCall: vi.fn((name) => ({ name })),
  }))
  applyHarnessMocks()
  return import('./run-turn')
}

// Same harness, real AI SDK. Whether a turn survives a disconnected client is a
// property of the actual stream plumbing — a stubbed `ai` can only report that
// runTurn called a method, not that the reply reached the database.
export const loadRunTurnWithRealStreamText = async () => {
  vi.resetModules()
  applyHarnessMocks()
  return import('./run-turn')
}

export const context = (
  overrides: Partial<TurnContext> = {},
): TurnContext => ({
  userId: 'user-1',
  conversationId: 'conversation-1',
  voyageSlug: null,
  authState: 'authenticated',
  autoSent: false,
  newMessage: 'Hello Voyager',
  displayName: 'Isaac',
  ...overrides,
})

export const stubHost = () => {
  const deferred: Promise<unknown>[] = []
  const host: HarnessHost = {
    defer: (promise) => deferred.push(promise),
    now: () => new Date('2026-07-11T00:00:00.000Z'),
  }
  return { host, deferred }
}

export const resetRunTurnFixture = () => {
  vi.clearAllMocks()
  streamText.mockReturnValue(streamResult)
  reapStuckTasks.mockResolvedValue(undefined)
  composeContextFromStream.mockResolvedValue([])
  renderMessagesForModel.mockImplementation((messages) => messages)
  createMessageEvent.mockResolvedValue('event-1')
  claimSourceIngress.mockResolvedValue({
    eventId: 'event-1', status: 'created', recipients: [],
  })
  enrichNewIngress.mockResolvedValue(undefined)
  getRoom.mockResolvedValue({ roomPeople: [], aiPresent: true, spaceId: null })
  getOwnVoyagerIdentity.mockResolvedValue({ handle: '', displayName: null })
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
}
