import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type DbError = { message: string }
type QueryResult = { data: unknown; error: DbError | null }
type Filter = (row: AgentTaskRow) => boolean

interface AgentTaskRow {
  id: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  error: string | null
  updated_at: string
}

const rows = new Map<string, AgentTaskRow>()

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

class FakeQuery implements PromiseLike<QueryResult> {
  private action: 'select' | 'update' = 'select'
  private filters: Filter[] = []
  private payload: Partial<AgentTaskRow> = {}

  update(payload: Partial<AgentTaskRow>) {
    this.action = 'update'
    this.payload = payload
    return this
  }

  select(_columns: string) {
    return this
  }

  in(column: keyof AgentTaskRow, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]))
    return this
  }

  lt(column: keyof AgentTaskRow, value: string) {
    this.filters.push((row) => String(row[column]) < value)
    return this
  }

  is(column: keyof AgentTaskRow, value: unknown) {
    this.filters.push((row) => row[column] === value)
    return this
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private execute(): Promise<QueryResult> {
    const matches = Array.from(rows.values()).filter((row) =>
      this.filters.every((filter) => filter(row))
    )

    if (this.action === 'update') {
      matches.forEach((row) => Object.assign(row, this.payload))
    }

    return Promise.resolve({ data: matches.map(({ id }) => ({ id })), error: null })
  }
}

const fakeAdmin = {
  from: (_table: string) => new FakeQuery(),
}

const loadQueueModule = async () => {
  vi.resetModules()
  vi.doMock('@/lib/supabase/admin', () => ({ getAdminClient: () => fakeAdmin }))
  return import('./queue')
}

describe('agent task terminal discipline', () => {
  beforeEach(() => {
    rows.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reaps a stale running task', async () => {
    rows.set('stale', {
      id: 'stale',
      status: 'running',
      error: null,
      updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    })
    const { reapStuckTasks } = await loadQueueModule()

    await expect(reapStuckTasks()).resolves.toBe(1)
    expect(rows.get('stale')).toMatchObject({
      status: 'failed',
      error: 'reaped: no terminal state within TTL',
    })
  })

  it('leaves a fresh running task untouched', async () => {
    const fresh = {
      id: 'fresh',
      status: 'running' as const,
      error: null,
      updated_at: new Date(Date.now() - 60 * 1000).toISOString(),
    }
    rows.set(fresh.id, clone(fresh))
    const { reapStuckTasks } = await loadQueueModule()

    await expect(reapStuckTasks()).resolves.toBe(0)
    expect(rows.get('fresh')).toEqual(fresh)
  })

  it('fails a background task that exceeds its deadline without completing it', async () => {
    vi.useFakeTimers()
    const { runGuardedBackgroundTask } = await loadQueueModule()
    const complete = vi.fn(async () => {})
    const fail = vi.fn(async () => {})
    const run = vi.fn(() => new Promise<never>(() => {}))

    const guardedTask = runGuardedBackgroundTask({
      taskId: 'timed-out',
      run,
      onComplete: complete,
      fail,
    })
    await vi.advanceTimersByTimeAsync(25_000)
    await guardedTask

    expect(run).toHaveBeenCalledOnce()
    expect(fail).toHaveBeenCalledWith('timed-out', 'Background agent timed out')
    expect(complete).not.toHaveBeenCalled()
  })
})
