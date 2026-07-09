import { beforeEach, describe, expect, it, vi } from 'vitest'

type DbError = { message: string }
type QueryResult = { data: unknown; error: DbError | null }
type TableName = 'knowledge_events' | 'knowledge_current'

const insertedEvents: Array<Record<string, unknown>> = []
const updatePayloads: Array<{ table: TableName; payload: Record<string, unknown> }> = []
const embeddingCreate = vi.fn()

let nextEvent = 1

class FakeQuery implements PromiseLike<QueryResult> {
  private action: 'select' | 'insert' | 'update' = 'select'
  private payload: unknown

  constructor(private readonly table: TableName) {}

  select(_columns: string) { return this }
  eq(_column: string, _value: unknown) { return this }

  insert(payload: unknown) {
    this.action = 'insert'
    this.payload = payload
    return this
  }

  update(payload: unknown) {
    this.action = 'update'
    this.payload = payload
    return this
  }

  single(): Promise<QueryResult> {
    return this.execute(true)
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private execute(single = false): Promise<QueryResult> {
    if (this.action === 'insert') {
      const row = {
        ...(this.payload as Record<string, unknown>),
        id: `event-${nextEvent++}`,
      }
      insertedEvents.push(row)
      return Promise.resolve({ data: single ? { id: row.id } : [row], error: null })
    }

    if (this.action === 'update') {
      updatePayloads.push({
        table: this.table,
        payload: this.payload as Record<string, unknown>,
      })
    }

    return Promise.resolve({ data: single ? null : [], error: null })
  }
}

const fakeAdmin = {
  from: (table: TableName) => new FakeQuery(table),
  rpc: vi.fn(),
}

const loadEventsModule = async () => {
  vi.resetModules()
  vi.doMock('openai', () => ({
    default: class FakeOpenAI {
      embeddings = { create: embeddingCreate }
    },
  }))
  vi.doMock('@/lib/supabase/admin', () => ({ getAdminClient: () => fakeAdmin }))
  return import('./events')
}

describe('knowledge source events without legacy array linking', () => {
  beforeEach(() => {
    insertedEvents.length = 0
    updatePayloads.length = 0
    nextEvent = 1
    vi.clearAllMocks()
    embeddingCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3] }] })
    fakeAdmin.rpc.mockResolvedValue({ data: null, error: null })
  })

  it('creates an entity-bearing source event without updating the legacy array column', async () => {
    const events = await loadEventsModule()

    const eventId = await events.createSourceEvent({
      eventType: 'explicit',
      content: 'Cartographer owns semantic edge creation.',
      userId: 'user-1',
      voyageSlug: 'fambam',
      metadata: {
        classifications: ['fact'],
        entities: ['Cartographer'],
        topics: ['retrieval'],
      },
      sourceType: 'explicit',
    })

    const retiredColumn = ['connected', 'to'].join('_')

    expect(eventId).toBe('event-1')
    expect(insertedEvents).toHaveLength(1)
    expect((insertedEvents[0].metadata as { entities: string[] }).entities).toEqual(['Cartographer'])
    expect(updatePayloads.some(({ payload }) => Object.hasOwn(payload, retiredColumn))).toBe(false)
    expect(fakeAdmin.rpc).toHaveBeenCalledWith('update_knowledge_embedding', {
      p_event_id: 'event-1',
      p_embedding: '[0.1,0.2,0.3]',
    })
  })

  it('does not expose the retired linker helper', async () => {
    const events = await loadEventsModule()
    const retiredExport = ['autoLinkBy', 'Entities'].join('')

    expect(events).not.toHaveProperty(retiredExport)
  })
})
