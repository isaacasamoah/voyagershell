import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  cite: vi.fn(),
}))

vi.mock('ai', () => ({ tool: (definition: unknown) => definition }))
vi.mock('@/lib/knowledge/unit-search', () => ({
  temporalUnitSearch: mocks.search,
}))
vi.mock('@/lib/knowledge/lifecycle/citations', () => ({
  recordKnowledgeUnitCitations: mocks.cite,
}))

import { createTemporalRetrievalTool } from './temporal-retrieval-tool'

const UNIT_ID = '71000000-0000-4000-8000-000000000001'
const EVENT_ID = '71000000-0000-4000-8000-000000000002'
const reached = {
  outcome: 'success' as const,
  hits: [{
    unitId: UNIT_ID,
    claim: 'The launch moved to Tuesday.',
    sourceEventId: EVENT_ID,
    sourceContent: 'The launch moved to Tuesday.',
    sourceCreatedAt: '2026-08-02T00:00:00Z',
    knowledgeType: 'operational',
    retired: false,
    effectiveAttention: 0.8,
    score: null,
  }],
}

describe('temporal unit-search delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.search.mockResolvedValue(reached)
  })

  it('records search citation before exposing time-search results', async () => {
    mocks.cite.mockResolvedValue({ outcome: 'recorded', inserted: 1 })
    const registered = createTemporalRetrievalTool({
      userId: 'person-1', conversationId: 'session-1',
    })
    if (!registered.execute) throw new Error('temporal_not_executable')
    const output = await registered.execute(
      { since: '2026-08-01T00:00:00Z', limit: 15 },
      { toolCallId: 'temporal-test', messages: [] },
    )

    expect(mocks.cite).toHaveBeenCalledWith({
      personId: 'person-1',
      sessionId: 'session-1',
      channel: 'search',
      knowledgeUnitIds: [UNIT_ID],
    })
    expect(output).toContain(`id:${UNIT_ID}`)
    expect(output).toContain(`source:${EVENT_ID}`)
  })

  it('withholds time-search results when citation recording fails', async () => {
    mocks.cite.mockResolvedValue({ outcome: 'failed', inserted: 0 })
    const registered = createTemporalRetrievalTool({
      userId: 'person-1', conversationId: 'session-1',
    })
    if (!registered.execute) throw new Error('temporal_not_executable')
    const output = await registered.execute(
      { since: '2026-08-01T00:00:00Z', limit: 15 },
      { toolCallId: 'temporal-test', messages: [] },
    )

    expect(output).not.toContain(UNIT_ID)
    expect(output).toContain('withheld')
  })

  it('labels retired time-search hits with shared markers and no score', async () => {
    mocks.search.mockResolvedValue({
      outcome: 'success',
      hits: [{ ...reached.hits[0], retired: true, effectiveAttention: 0.95 }],
    })
    mocks.cite.mockResolvedValue({ outcome: 'recorded', inserted: 1 })
    const registered = createTemporalRetrievalTool({
      userId: 'person-1', conversationId: 'session-1',
    })
    if (!registered.execute) throw new Error('temporal_not_executable')
    const since = '2026-08-01T00:00:00Z'
    const until = '2026-08-03T00:00:00Z'
    const output = await registered.execute(
      { since, until, limit: 15 },
      { toolCallId: 'temporal-test', messages: [] },
    )

    expect(output).toBe(
      `Found 1 items from ${new Date(since).toLocaleDateString()} to ${new Date(until).toLocaleDateString()}:\n\n[1] id:${UNIT_ID} source:${EVENT_ID} [RETRACTED] [PINNED]\nThe launch moved to Tuesday.`,
    )
  })
})
