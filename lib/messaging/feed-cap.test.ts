import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedEventRow } from './feed-rows'

const { getFeedTableClient } = vi.hoisted(() => ({ getFeedTableClient: vi.fn() }))

vi.mock('./feed-enrichment', () => ({
  getFeedTableClient,
  emptyFeedEnrichment: vi.fn(),
  loadPrivateFeedEnrichment: vi.fn(),
  resolveViewerInviteStates: vi.fn(),
}))
vi.mock('@/lib/voyage/session', () => ({
  resolveSessionVoyage: vi.fn(async () => null),
}))

import { queryScopedEvents } from './feed-queries'

// ── A Postgres that actually answers ────────────────────────────────────────
// The bug this file exists for is an ordering bug between the database and the
// process: which rows the cap counts. A mock that only records `.limit(200)` was
// called can't tell the two orderings apart, so this one evaluates the filters
// against real rows and applies the cap where PostgREST would — after them.

type Row = Record<string, unknown>

const readColumn = (row: Row, column: string): unknown => {
  const [base, key] = column.split('->>')
  if (!key) return row[base]
  const value = row[base]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const nested = (value as Row)[key]
  return typeof nested === 'string' ? nested : null
}

// `a.eq.x,and(b.is.null,c.eq.y)` — commas separate alternatives, `and(...)`
// groups them. Splits at depth zero so a group's own commas stay inside it.
const splitTopLevel = (expression: string): string[] => {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < expression.length; index++) {
    const character = expression[index]
    if (character === '(') depth++
    else if (character === ')') depth--
    else if (character === ',' && depth === 0) {
      parts.push(expression.slice(start, index))
      start = index + 1
    }
  }
  parts.push(expression.slice(start))
  return parts
}

const matchesTerm = (row: Row, term: string): boolean => {
  const group = /^(and|or)\((.*)\)$/.exec(term)
  if (group) {
    const terms = splitTopLevel(group[2])
    return group[1] === 'and'
      ? terms.every((inner) => matchesTerm(row, inner))
      : terms.some((inner) => matchesTerm(row, inner))
  }

  const separator = term.indexOf('.')
  const column = term.slice(0, separator)
  const rest = term.slice(separator + 1)
  const operatorEnd = rest.indexOf('.')
  const operator = rest.slice(0, operatorEnd)
  const operand = rest.slice(operatorEnd + 1)
  const value = readColumn(row, column)

  if (operator === 'eq') return value === operand
  if (operator === 'is') {
    if (operand !== 'null') throw new Error(`unsupported is.${operand}`)
    return value === null || value === undefined
  }
  throw new Error(`unsupported operator: ${operator}`)
}

const createFakeClient = (rows: Row[]) => {
  const build = (table: string) => {
    let working = rows.filter((row) => row.__table === table)
    let cap: number | null = null

    const builder = {
      select: () => builder,
      in: (column: string, values: unknown[]) => {
        working = working.filter((row) => values.includes(readColumn(row, column)))
        return builder
      },
      contains: (column: string, values: unknown[]) => {
        working = working.filter((row) => {
          const stored = row[column]
          return Array.isArray(stored) && values.every((value) => stored.includes(value))
        })
        return builder
      },
      or: (expression: string) => {
        const terms = splitTopLevel(expression)
        working = working.filter((row) => terms.some((term) => matchesTerm(row, term)))
        return builder
      },
      eq: (column: string, value: unknown) => {
        working = working.filter((row) => readColumn(row, column) === value)
        return builder
      },
      is: (column: string, value: unknown) => {
        working = working.filter((row) => readColumn(row, column) === value)
        return builder
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        const direction = options?.ascending === false ? -1 : 1
        working = [...working].sort((left, right) => (
          String(left[column]) < String(right[column]) ? -direction : direction
        ))
        return builder
      },
      limit: (count: number) => {
        cap = count
        return builder
      },
      then: (resolve: (result: { data: Row[]; error: null }) => unknown) => (
        resolve({ data: cap === null ? working : working.slice(0, cap), error: null })
      ),
    }
    return builder
  }
  return { from: build }
}

// Newest first, so index 0 is the most recent row.
const eventRow = (index: number, conversationId: string): Row => ({
  __table: 'knowledge_events',
  id: `evt-${index}`,
  event_type: 'conversation',
  content: `turn ${index}`,
  created_at: new Date(Date.UTC(2026, 0, 1) - index * 60_000).toISOString(),
  metadata: { session_id: conversationId },
  source_ref: { conversation_id: conversationId, role: 'assistant' },
  actor_type: 'voyager',
  user_id: 'user-1',
  participants: ['user-1'],
  voyage_slug: null,
})

// Every other row belongs to a different session of the same user, in the same
// space — the rows that used to be fetched, counted against the cap, and thrown
// away.
const interleavedHistory = (total: number): Row[] => Array.from(
  { length: total },
  (_, index) => eventRow(index, index % 2 === 0 ? 'conv-current' : 'conv-other'),
)

describe('the feed cap counts rows the user actually sees', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fills a 200-row cap from a history where half the rows are out of context', async () => {
    getFeedTableClient.mockReturnValue(createFakeClient(interleavedHistory(600)))

    const rows = await queryScopedEvents('user-1', 'conv-current', null, 200)

    expect(rows).toHaveLength(200)
    expect(rows.every((row) => readColumn(row as unknown as Row, 'metadata->>session_id') === 'conv-current')).toBe(true)
  })

  it('keeps a row whose pre-filter rank is past the cap but whose visible rank is not', async () => {
    // evt-202 sits at pre-filter rank 203 and visible rank 102: comfortably
    // inside a 200-row feed, and invisible until the cap stopped counting rows
    // destined for the bin.
    getFeedTableClient.mockReturnValue(createFakeClient(interleavedHistory(600)))

    const rows = await queryScopedEvents('user-1', 'conv-current', null, 200)

    expect(rows.map((row) => row.id)).toContain('evt-202')
  })

  it('reaches a legacy row that carries its session on source_ref alone', async () => {
    const legacy: Row = {
      ...eventRow(0, 'conv-current'),
      id: 'evt-legacy',
      metadata: { classifications: [] },
    }
    getFeedTableClient.mockReturnValue(createFakeClient([legacy]))

    const rows = await queryScopedEvents('user-1', 'conv-current', null, 200)

    expect(rows.map((row) => row.id)).toEqual(['evt-legacy'])
  })

  it('still excludes another session, another voyage, and another participant', async () => {
    const rows = [
      { ...eventRow(0, 'conv-current'), id: 'mine' },
      { ...eventRow(1, 'conv-other'), id: 'other-session' },
      { ...eventRow(2, 'conv-current'), id: 'other-voyage', voyage_slug: 'launch' },
      { ...eventRow(3, 'conv-current'), id: 'not-mine', participants: ['user-2'] },
    ]
    getFeedTableClient.mockReturnValue(createFakeClient(rows))

    const visible = await queryScopedEvents('user-1', 'conv-current', null, 200)

    expect(visible.map((row) => row.id)).toEqual(['mine'])
  })
})

// Guards the fake against silently accepting anything: if the parser stops
// understanding the expression the production code builds, these tests stop
// meaning what they claim.
describe('the fake PostgREST evaluates the expression it is given', () => {
  const row: FeedEventRow = eventRow(0, 'conv-current') as unknown as FeedEventRow

  it('matches on a json key and rejects a mismatch', () => {
    expect(matchesTerm(row as unknown as Row, 'metadata->>session_id.eq.conv-current')).toBe(true)
    expect(matchesTerm(row as unknown as Row, 'metadata->>session_id.eq.conv-other')).toBe(false)
  })

  it('evaluates a nested and-group', () => {
    expect(matchesTerm(
      row as unknown as Row,
      'and(metadata->>session_id.is.null,source_ref->>conversation_id.eq.conv-current)',
    )).toBe(false)
    expect(matchesTerm(
      { ...row, metadata: {} } as unknown as Row,
      'and(metadata->>session_id.is.null,source_ref->>conversation_id.eq.conv-current)',
    )).toBe(true)
  })
})
