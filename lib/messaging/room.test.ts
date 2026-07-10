import { beforeEach, describe, expect, it, vi } from 'vitest'

type DbError = { message: string }
type QueryResult = { data: unknown; error: DbError | null }
type TableName = 'sessions' | 'spaces' | 'space_members'
type Filter = { column: string; value: unknown }

interface SessionRow {
  id: string
  user_id: string | null
  voyage_id: string | null
  space_id: string | null
}

interface SpaceRow {
  id: string
  kind: string
  voyage_id: string | null
  ai_present: boolean
  created_by: string | null
}

interface SpaceMemberRow {
  space_id: string
  user_id: string
  state: 'invited' | 'active' | 'left'
}

const db = {
  sessions: new Map<string, SessionRow>(),
  spaces: new Map<string, SpaceRow>(),
  space_members: new Map<string, SpaceMemberRow>(),
}

const sessionUpdates: Array<Record<string, unknown>> = []
let nextSpace = 1

const resetDb = () => {
  db.sessions.clear()
  db.spaces.clear()
  db.space_members.clear()
  sessionUpdates.length = 0
  nextSpace = 1
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const tableRows = (table: TableName): Array<Record<string, unknown>> => {
  if (table === 'sessions') return Array.from(db.sessions.values()) as unknown as Array<Record<string, unknown>>
  if (table === 'spaces') return Array.from(db.spaces.values()) as unknown as Array<Record<string, unknown>>
  return Array.from(db.space_members.values()) as unknown as Array<Record<string, unknown>>
}

const memberKey = (row: Pick<SpaceMemberRow, 'space_id' | 'user_id'>) => `${row.space_id}:${row.user_id}`

class FakeQuery implements PromiseLike<QueryResult> {
  private action: 'select' | 'insert' | 'update' | 'upsert' = 'select'
  private filters: Filter[] = []
  private payload: unknown

  constructor(private readonly table: TableName) {}

  select(_columns: string) {
    if (this.action === 'select') this.action = 'select'
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value })
    return this
  }

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

  upsert(payload: unknown, _options?: unknown) {
    this.action = 'upsert'
    this.payload = payload
    return this
  }

  maybeSingle(): Promise<QueryResult> {
    return this.execute(true)
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

  private matches(row: Record<string, unknown>) {
    return this.filters.every((filter) => row[filter.column] === filter.value)
  }

  private execute(single = false): Promise<QueryResult> {
    if (this.action === 'insert') return Promise.resolve(this.insertRows(single))
    if (this.action === 'update') return Promise.resolve(this.updateRows())
    if (this.action === 'upsert') return Promise.resolve(this.upsertRows())

    const rows = tableRows(this.table).filter((row) => this.matches(row)).map(clone)
    return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null })
  }

  private insertRows(single: boolean): QueryResult {
    const rows = Array.isArray(this.payload) ? this.payload : [this.payload]
    const inserted = rows.map((raw) => {
      const row = raw as Partial<SpaceRow>
      const id = row.id ?? `space-${nextSpace++}`
      const space: SpaceRow = {
        id,
        kind: row.kind ?? 'room',
        voyage_id: row.voyage_id ?? null,
        ai_present: row.ai_present ?? true,
        created_by: row.created_by ?? null,
      }
      db.spaces.set(id, space)
      return clone(space)
    })
    return { data: single ? inserted[0] : inserted, error: null }
  }

  private updateRows(): QueryResult {
    const patch = this.payload as Record<string, unknown>
    const rows = tableRows(this.table).filter((row) => this.matches(row))
    if (this.table === 'sessions') sessionUpdates.push(clone(patch))
    rows.forEach((row) => Object.assign(row, patch))
    return { data: rows.map(clone), error: null }
  }

  private upsertRows(): QueryResult {
    const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]) as SpaceMemberRow[]
    rows.forEach((row) => {
      const key = memberKey(row)
      db.space_members.set(key, { ...db.space_members.get(key), ...row })
    })
    return { data: rows.map(clone), error: null }
  }
}

const fakeAdmin = {
  from: (table: TableName) => new FakeQuery(table),
}

const loadRoomModule = async () => {
  vi.resetModules()
  vi.doMock('@/lib/supabase/admin', () => ({ getAdminClient: () => fakeAdmin }))
  vi.doMock('@/lib/debug', () => ({ log: { api: vi.fn() } }))
  return import('./room')
}

describe('space-backed room API', () => {
  beforeEach(() => {
    resetDb()
    vi.clearAllMocks()
  })

  it('shows the same shared space from each member session, excluding self', async () => {
    db.sessions.set('session-a', { id: 'session-a', user_id: 'user-a', voyage_id: 'voyage-1', space_id: 'space-1' })
    db.sessions.set('session-b', { id: 'session-b', user_id: 'user-b', voyage_id: 'voyage-1', space_id: 'space-1' })
    db.spaces.set('space-1', { id: 'space-1', kind: 'room', voyage_id: 'voyage-1', ai_present: false, created_by: 'user-a' })
    db.space_members.set('space-1:user-a', { space_id: 'space-1', user_id: 'user-a', state: 'active' })
    db.space_members.set('space-1:user-b', { space_id: 'space-1', user_id: 'user-b', state: 'active' })

    const { getRoom } = await loadRoomModule()

    await expect(getRoom('session-a')).resolves.toEqual({ roomPeople: ['user-b'], aiPresent: false })
    await expect(getRoom('session-b')).resolves.toEqual({ roomPeople: ['user-a'], aiPresent: false })
  })

  it('activates members through space_members and only links the session to a space', async () => {
    db.sessions.set('session-a', {
      id: 'session-a',
      user_id: 'user-a',
      voyage_id: 'voyage-1',
      space_id: null,
    })

    const { activateMembers, ensureSpace, getRoom } = await loadRoomModule()
    const session = db.sessions.get('session-a')
    if (!session) throw new Error('missing test session')
    const spaceId = await ensureSpace(session, true)
    await activateMembers(spaceId ?? '', ['user-a', 'user-b'])
    const room = await getRoom('session-a')

    expect(spaceId).toBe('space-1')
    expect(sessionUpdates).toEqual([{ space_id: 'space-1' }])
    expect(db.space_members.get(`${spaceId}:user-a`)?.state).toBe('active')
    expect(db.space_members.get(`${spaceId}:user-b`)?.state).toBe('active')
    expect(db.spaces.get(spaceId ?? '')?.ai_present).toBe(true)
    expect(room).toEqual({ roomPeople: ['user-b'], aiPresent: true })
  })

  it('exposes only active space members as roomPeople for message fan-out', async () => {
    db.sessions.set('session-a', { id: 'session-a', user_id: 'user-a', voyage_id: 'voyage-1', space_id: 'space-1' })
    db.spaces.set('space-1', { id: 'space-1', kind: 'room', voyage_id: 'voyage-1', ai_present: true, created_by: 'user-a' })
    db.space_members.set('space-1:user-a', { space_id: 'space-1', user_id: 'user-a', state: 'active' })
    db.space_members.set('space-1:user-b', { space_id: 'space-1', user_id: 'user-b', state: 'active' })
    db.space_members.set('space-1:user-c', { space_id: 'space-1', user_id: 'user-c', state: 'left' })

    const { getRoom } = await loadRoomModule()

    await expect(getRoom('session-a')).resolves.toEqual({ roomPeople: ['user-b'], aiPresent: true })
  })

  it('removes members by marking them left and updates Voyager presence on spaces', async () => {
    db.sessions.set('session-a', { id: 'session-a', user_id: 'user-a', voyage_id: 'voyage-1', space_id: 'space-1' })
    db.spaces.set('space-1', { id: 'space-1', kind: 'room', voyage_id: 'voyage-1', ai_present: false, created_by: 'user-a' })
    db.space_members.set('space-1:user-a', { space_id: 'space-1', user_id: 'user-a', state: 'active' })
    db.space_members.set('space-1:user-b', { space_id: 'space-1', user_id: 'user-b', state: 'active' })

    const { getRoom, removeRoomPerson, setAiPresent } = await loadRoomModule()

    await removeRoomPerson('session-a', 'user-b')
    expect(db.space_members.get('space-1:user-b')?.state).toBe('left')
    await expect(getRoom('session-a')).resolves.toEqual({ roomPeople: [], aiPresent: false })

    await setAiPresent('session-a', true)
    expect(db.spaces.get('space-1')?.ai_present).toBe(true)
  })
})
