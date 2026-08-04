import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

const NEWER_ID = '71000000-0000-4000-8000-000000000003'
const OLDER_ID = '71000000-0000-4000-8000-000000000004'

// What the RPC hands back for a window is already the answer: it orders by
// source_created_at DESC and applies LIMIT itself (080_knowledge_search_
// findability_backfill.sql). The tool may not drop or reorder any of it.
const windowPage = {
  outcome: 'success' as const,
  hits: [
    {
      ...reached.hits[0], unitId: NEWER_ID,
      claim: 'The launch moved to Tuesday.',
      sourceCreatedAt: '2026-08-03T00:00:00Z',
    },
    {
      ...reached.hits[0], unitId: OLDER_ID,
      claim: 'Cubesat deployment slipped.',
      sourceCreatedAt: '2026-08-01T00:00:00Z',
    },
  ],
}

// A caller still emitting the removed `query` key — a model holding a stale
// tool definition mid-session. It must not cost the user their results.
const staleCall = {
  since: '2026-07-28T00:00:00Z',
  until: '2026-08-04T00:00:00Z',
  limit: 2,
  query: 'cubesat',
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

describe('temporal window is never narrowed after the database limit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.search.mockResolvedValue(windowPage)
    mocks.cite.mockResolvedValue({ outcome: 'recorded', inserted: 2 })
  })

  const execute = async (): Promise<string> => {
    const registered = createTemporalRetrievalTool({
      userId: 'person-1', conversationId: 'session-1',
    })
    if (!registered.execute) throw new Error('temporal_not_executable')
    return await registered.execute(
      staleCall, { toolCallId: 'temporal-test', messages: [] },
    ) as string
  }

  it('keeps in-window claims whose wording never mentions the search term', async () => {
    const output = await execute()

    expect(output).toContain('Found 2 items')
    expect(output).toContain(`id:${NEWER_ID}`)
    expect(output).toContain(`id:${OLDER_ID}`)
  })

  it('delivers the limited page in the order the database ranked it', async () => {
    const output = await execute()

    expect(mocks.search).toHaveBeenCalledWith(
      'person-1', '2026-07-28T00:00:00.000Z', '2026-08-04T00:00:00.000Z', 2,
    )
    expect(output).toContain(`[1] id:${NEWER_ID}`)
    expect(output).toContain(`[2] id:${OLDER_ID}`)
    expect(output.indexOf(NEWER_ID)).toBeLessThan(output.indexOf(OLDER_ID))
    expect(mocks.cite).toHaveBeenCalledWith(expect.objectContaining({
      knowledgeUnitIds: [NEWER_ID, OLDER_ID],
    }))
  })
})

describe('temporal tool advertises no text filter', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'lib/retrieval/temporal-retrieval-tool.ts'), 'utf8',
  )

  // The parameter is gone, not deprecated. Reintroducing the word here should
  // be a deliberate act that revisits this test, never an accidental stub.
  it('carries no query parameter and no client-side narrowing', () => {
    expect(source).not.toContain('query')
    expect(source).not.toContain('.filter(')
    expect(source).toContain('temporalUnitSearch(')
  })

  it('drops a stale query key at the schema boundary', () => {
    const registered = createTemporalRetrievalTool({
      userId: 'person-1', conversationId: 'session-1',
    })
    const schema = registered.inputSchema as { parse: (value: unknown) => object }

    expect(Object.keys(schema.parse(staleCall))).toEqual(
      ['since', 'until', 'limit'],
    )
  })
})
