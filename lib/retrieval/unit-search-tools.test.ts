import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  semantic: vi.fn(),
  keyword: vi.fn(),
  anchored: vi.fn(),
  exact: vi.fn(),
}))

vi.mock('ai', () => ({ tool: (definition: unknown) => definition }))
vi.mock('@/lib/knowledge/unit-search', () => ({
  semanticUnitSearch: mocks.semantic,
  keywordUnitSearch: mocks.keyword,
  anchoredUnitSearch: mocks.anchored,
  getKnowledgeUnitsByIds: mocks.exact,
}))

import { createUnitSearchTools } from './unit-search-tools'

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
    effectiveAttention: 0.8,
    score: 0.7,
  }],
}

describe('unit search delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.keyword.mockResolvedValue(reached)
    mocks.exact.mockResolvedValue(reached)
  })

  it('records search citation before exposing unit and source IDs', async () => {
    const recorder = vi.fn().mockResolvedValue({
      outcome: 'recorded', inserted: 1,
    })
    const registered = createUnitSearchTools(
      { userId: 'person-1', conversationId: 'session-1' }, recorder,
    ).keyword_grep
    if (!registered.execute) throw new Error('keyword_not_executable')
    const output = await registered.execute(
      { pattern: 'launch', limit: 10 },
      { toolCallId: 'keyword-test', messages: [] },
    )

    expect(recorder).toHaveBeenCalledWith({
      personId: 'person-1',
      sessionId: 'session-1',
      channel: 'search',
      knowledgeUnitIds: [UNIT_ID],
    })
    expect(output).toContain(`id:${UNIT_ID}`)
    expect(output).toContain(`source:${EVENT_ID}`)
  })

  it('withholds search results when citation recording fails', async () => {
    const registered = createUnitSearchTools(
      { userId: 'person-1', conversationId: 'session-1' },
      vi.fn().mockResolvedValue({ outcome: 'failed', inserted: 0 }),
    ).keyword_grep
    if (!registered.execute) throw new Error('keyword_not_executable')
    const output = await registered.execute(
      { pattern: 'launch', limit: 10 },
      { toolCallId: 'keyword-test', messages: [] },
    )

    expect(output).not.toContain(UNIT_ID)
    expect(output).toContain('withheld')
  })

  it('hydrates authorized source content after recording delivery', async () => {
    const recorder = vi.fn().mockResolvedValue({
      outcome: 'recorded', inserted: 1,
    })
    const hydratedSource = 'Full source turn with the launch rationale.'
    mocks.exact.mockResolvedValue({
      outcome: 'success',
      hits: [{
        ...reached.hits[0],
        get sourceContent() {
          if (recorder.mock.calls.length === 0)
            throw new Error('source_content_rendered_before_citation')
          return hydratedSource
        },
      }],
    })
    const registered = createUnitSearchTools(
      { userId: 'person-1', conversationId: 'session-1' }, recorder,
    ).get_nodes
    if (!registered.execute) throw new Error('get_nodes_not_executable')
    const output = await registered.execute(
      { nodeIds: [UNIT_ID] },
      { toolCallId: 'get-nodes-test', messages: [] },
    )

    expect(output).toContain('Source content:')
    expect(output).toContain(hydratedSource)
  })
})
