import { beforeEach, describe, expect, it, vi } from 'vitest'

const enqueueAgentTask = vi.fn()
const completeTask = vi.fn()
const failTask = vi.fn()
const runBackgroundRetrieval = vi.fn()
const createMessageEvent = vi.fn()
const fanOutDeliveries = vi.fn()

const runGuardedBackgroundTask = vi.fn(async (options: {
  taskId: string
  run: () => Promise<unknown>
  onComplete: (result: any) => Promise<void>
  onFailure?: (error: unknown) => void
}) => {
  try {
    const result = await options.run()
    await options.onComplete(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    await failTask(options.taskId, message)
    options.onFailure?.(error)
  }
})

const loadTools = async () => {
  vi.resetModules()
  vi.doMock('ai', () => ({ tool: (definition: unknown) => definition }))
  vi.doMock('@/lib/knowledge', () => ({
    searchKnowledge: vi.fn(),
    keywordGrep: vi.fn(),
    personAnchoredSearch: vi.fn(),
    getKnowledgeByIds: vi.fn(),
  }))
  vi.doMock('@/lib/knowledge/hybrid', () => ({ hybridSearch: vi.fn() }))
  vi.doMock('@/lib/messaging/deliveries', () => ({ fanOutDeliveries }))
  vi.doMock('@/lib/messaging/room', () => ({
    getRoom: vi.fn(),
    removeRoomPerson: vi.fn(),
    setAiPresent: vi.fn(),
  }))
  vi.doMock('@/lib/messaging/invites', () => ({
    inviteToRoom: vi.fn(),
    respondToRoomInvite: vi.fn(),
    deliverRoomInvite: vi.fn(),
  }))
  vi.doMock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }))
  vi.doMock('@/lib/agents/queue', () => ({
    enqueueAgentTask,
    completeTask,
    runGuardedBackgroundTask,
  }))
  vi.doMock('@/lib/agents/deep-retrieval', () => ({ runBackgroundRetrieval }))
  vi.doMock('@/lib/tools/captain', () => ({ createCaptainTools: () => ({}) }))
  vi.doMock('@/lib/voyage/core', () => ({
    createVoyage: vi.fn(),
    getVoyageBySlug: vi.fn(),
  }))
  vi.doMock('@/lib/voyage/session', () => ({
    generateSlug: vi.fn(),
    isSlugAvailable: vi.fn(),
  }))
  vi.doMock('@/lib/voyage/members', () => ({
    getVoyageMembers: vi.fn(),
    isCaptain: vi.fn(),
    getUserVoyages: vi.fn(),
    resolveMemberByName: vi.fn(),
  }))
  vi.doMock('@/lib/voyage/invitations', () => ({ sendVoyageInvite: vi.fn() }))
  vi.doMock('@/lib/voyage/username', () => ({ normalizeUsername: vi.fn() }))
  vi.doMock('@/lib/knowledge/events', () => ({
    createMessageEvent,
    createExplicitEvent: vi.fn(),
  }))
  return import('./retrieval-tools')
}

const executeBackgroundTask = async () => {
  const { createRetrievalTools } = await loadTools()
  let backgroundPromise: Promise<unknown> | undefined
  const tools = createRetrievalTools({
    userId: 'user-1',
    voyageSlug: 'launch',
    conversationId: 'conversation-1',
    messages: [{ role: 'user', content: 'Please research this' }],
    waitUntil: (promise) => {
      backgroundPromise = promise
    },
  }) as unknown as {
    spawn_background_agent: {
      execute: (input: {
        objective: string
        context?: string
        priority?: 'low' | 'normal' | 'high'
      }) => Promise<string>
    }
  }

  const response = await tools.spawn_background_agent.execute({
    objective: 'Map every launch dependency',
    context: 'The release is Friday.',
    priority: 'high',
  })
  await backgroundPromise
  return response
}

describe('spawn_background_agent delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    enqueueAgentTask.mockResolvedValue('task-12345678')
    createMessageEvent.mockResolvedValue('event-1')
    fanOutDeliveries.mockResolvedValue(undefined)
    completeTask.mockResolvedValue(undefined)
    failTask.mockResolvedValue(undefined)
  })

  it('emits a private conversation result before completing the audit task', async () => {
    const result = {
      message: 'I mapped the launch dependencies.',
      findings: [{ content: 'web_search: release details' }],
      confidence: 0.2,
    }
    runBackgroundRetrieval.mockResolvedValue(result)

    const response = await executeBackgroundTask()

    expect(response).toContain('Background search started')
    expect(createMessageEvent).toHaveBeenCalledWith(
      'conversation-1',
      'assistant',
      result.message,
      {
        userId: 'user-1',
        voyageSlug: 'launch',
        participants: ['user-1'],
        source: 'agent',
        attentionScore: 0.85,
        eventType: 'conversation',
        contextSnippet: 'Voyager research: Map every launch dependency',
      },
    )
    expect(fanOutDeliveries).not.toHaveBeenCalled()
    expect(completeTask).toHaveBeenCalledWith(
      'task-12345678',
      result,
      expect.any(Number),
    )
    expect(createMessageEvent.mock.invocationCallOrder[0])
      .toBeLessThan(completeTask.mock.invocationCallOrder[0])
    expect(failTask).not.toHaveBeenCalled()
  })

  it('records retrieval failure without emitting a delivered message', async () => {
    runBackgroundRetrieval.mockRejectedValue(new Error('retrieval exploded'))

    await executeBackgroundTask()

    expect(failTask).toHaveBeenCalledWith('task-12345678', 'retrieval exploded')
    expect(createMessageEvent).not.toHaveBeenCalled()
    expect(fanOutDeliveries).not.toHaveBeenCalled()
    expect(completeTask).not.toHaveBeenCalled()
  })

  it('records a surfacing failure instead of falsely completing the task', async () => {
    runBackgroundRetrieval.mockResolvedValue({
      message: 'Research ready.',
      findings: [],
      confidence: 0,
    })
    createMessageEvent.mockResolvedValue(null)

    await executeBackgroundTask()

    expect(failTask).toHaveBeenCalledWith(
      'task-12345678',
      'Failed to create background research message event',
    )
    expect(fanOutDeliveries).not.toHaveBeenCalled()
    expect(completeTask).not.toHaveBeenCalled()
  })
})
