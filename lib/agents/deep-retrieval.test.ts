import { beforeEach, describe, expect, it, vi } from 'vitest'

const generateText = vi.fn()
const stepCountIs = vi.fn(() => 'step-limit')
const updateTaskProgress = vi.fn()

const loadModule = async () => {
  vi.resetModules()
  vi.doMock('ai', () => ({ generateText, stepCountIs }))
  vi.doMock('@/lib/retrieval/retrieval-tools', () => ({
    createRetrievalTools: () => ({ web_search: {}, semantic_search: {} }),
  }))
  vi.doMock('@/lib/agents/queue', () => ({ updateTaskProgress }))
  vi.doMock('@/lib/models', () => ({
    resolveUserModelWithMeta: vi.fn().mockResolvedValue({
      model: 'model',
      label: 'fixture',
      viaConnection: false,
    }),
  }))
  vi.doMock('@/lib/debug', () => ({ log: { agent: vi.fn() } }))
  return import('./deep-retrieval')
}

describe('runBackgroundRetrieval', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateTaskProgress.mockResolvedValue(undefined)
  })

  it('builds findings from structured tool results and returns the final text verbatim', async () => {
    generateText.mockImplementation(async (options: {
      onStepFinish: (step: { toolResults: Array<Record<string, unknown>> }) => void
    }) => {
      options.onStepFinish({
        toolResults: [
          {
            toolName: 'web_search',
            output: 'A free-text web result that has no ledger event ID.',
          },
          {
            toolName: 'semantic_search',
            output: { eventId: 'event-123', content: 'A structured knowledge result.' },
          },
        ],
      })

      return {
        text: 'Here is the synthesized answer. The prose token id:deadbeef is not a finding.',
        steps: [{}],
      }
    })

    const { runBackgroundRetrieval } = await loadModule()
    const result = await runBackgroundRetrieval({
      taskId: 'task-12345678',
      objective: 'Research the launch plan',
      userId: 'user-1',
      voyageSlug: 'launch',
      conversationId: 'conversation-1',
    })

    expect(result.message).toBe(
      'Here is the synthesized answer. The prose token id:deadbeef is not a finding.',
    )
    expect(result.findings).toEqual([
      {
        content: 'web_search: A free-text web result that has no ledger event ID.',
      },
      {
        eventId: 'event-123',
        content: 'semantic_search: {"eventId":"event-123","content":"A structured knowledge result."}',
      },
    ])
    expect(result.findings.some((finding) => finding.content.includes('deadbeef'))).toBe(false)
    expect(result.confidence).toBe(0.4)
  })
})

// Omega P2 (2026-07-10): an empty final text must never ship a blank bubble.
describe('empty final text', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateTaskProgress.mockResolvedValue(undefined)
  })

  it('falls back to an honest findings summary when text is empty but findings exist', async () => {
    generateText.mockImplementation(async (options: {
      onStepFinish: (step: { toolResults: Array<Record<string, unknown>> }) => void
    }) => {
      options.onStepFinish({
        toolResults: [{ toolName: 'semantic_search', output: 'a real tool result' }],
      })
      return { text: '   ', steps: [{}] }
    })
    const { runBackgroundRetrieval } = await loadModule()
    const result = await runBackgroundRetrieval({
      taskId: 'task-1', objective: 'x', context: '', userId: 'u', conversationId: 'c',
    })
    expect(result.message).toMatch(/couldn't shape a clear answer/)
    expect(result.message.trim().length).toBeGreaterThan(0)
  })

  it('throws (→ failTask via the guard) when text and findings are both empty', async () => {
    generateText.mockImplementation(async () => ({ text: '', steps: [] }))
    const { runBackgroundRetrieval } = await loadModule()
    await expect(runBackgroundRetrieval({
      taskId: 'task-1', objective: 'x', context: '', userId: 'u', conversationId: 'c',
    })).rejects.toThrow(/no answer text and no findings/)
  })
})
