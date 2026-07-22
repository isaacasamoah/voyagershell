import { beforeEach, describe, expect, it, vi } from 'vitest'

interface QueryResult {
  data: unknown
  error: { message: string } | null
}

const state = vi.hoisted(() => ({
  destinationSpaceId: 'space-current',
  promotionDestinationSpaceId: 'space-current',
  queries: [] as Array<{ table: string; filters: Record<string, unknown> }>,
}))

const privateReply = {
  id: 'private-reply-1',
  event_type: 'conversation',
  content: 'A private answer.',
  created_at: '2026-07-22T00:00:00.000Z',
  metadata: { session_id: 'conversation-1' },
  source_ref: { conversation_id: 'conversation-1', role: 'assistant' },
  actor_type: 'voyager',
  user_id: 'user-isaac',
  participants: ['user-isaac'],
  voyage_slug: null,
}

class FakeQuery implements PromiseLike<QueryResult> {
  private readonly filters: Record<string, unknown> = {}

  constructor(private readonly table: string) {}

  select(_columns: string) { return this }
  in(column: string, values: unknown[]) { this.filters[column] = values; return this }
  contains(column: string, value: unknown) { this.filters[column] = value; return this }
  order(_column: string, _options?: unknown) { return this }
  limit(_limit: number) { return this }
  is(column: string, value: unknown) { this.filters[column] = value; return this }
  eq(column: string, value: unknown) { this.filters[column] = value; return this }

  maybeSingle(): Promise<QueryResult> {
    state.queries.push({ table: this.table, filters: { ...this.filters } })
    if (this.table === 'sessions') {
      return Promise.resolve({ data: { space_id: state.destinationSpaceId }, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    state.queries.push({ table: this.table, filters: { ...this.filters } })
    let result: QueryResult = { data: [], error: null }
    if (this.table === 'knowledge_events') result = { data: [privateReply], error: null }
    if (this.table === 'private_reply_promotions') {
      result = {
        data: this.filters.destination_space_id === state.promotionDestinationSpaceId
          ? [{ source_event_id: privateReply.id }]
          : [],
        error: null,
      }
    }
    return Promise.resolve(result).then(onfulfilled, onrejected)
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ from: (table: string) => new FakeQuery(table) }),
}))
vi.mock('@/lib/voyage', () => ({
  SessionAccessError: class SessionAccessError extends Error {},
  resolveSessionVoyage: vi.fn().mockResolvedValue(null),
  getVoyageBySlug: vi.fn(),
}))
vi.mock('@/lib/messaging/handles', () => ({
  getOwnVoyagerIdentity: vi.fn().mockResolvedValue({
    handle: 'sol',
    displayName: 'Sol',
  }),
}))

import { getFeed } from './feed'

describe('getFeed private server state', () => {
  beforeEach(() => {
    state.destinationSpaceId = 'space-current'
    state.promotionDestinationSpaceId = 'space-current'
    state.queries.length = 0
  })

  it('enriches private history with current identity and current-room share state', async () => {
    const [event] = await getFeed('user-isaac', 'conversation-1')
    expect(event).toMatchObject({
      id: 'private-reply-1',
      senderDisplayName: 'Sol',
      shared: true,
    })
    expect(state.queries).toContainEqual({
      table: 'private_reply_promotions',
      filters: {
        sharer_user_id: 'user-isaac',
        destination_space_id: 'space-current',
        source_event_id: ['private-reply-1'],
      },
    })
  })

  it('does not carry a share marker from a different destination room', async () => {
    state.promotionDestinationSpaceId = 'space-old'
    const [event] = await getFeed('user-isaac', 'conversation-1')
    expect(event.shared).toBe(false)
  })
})
