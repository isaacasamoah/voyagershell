import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type DbError = { message: string }
type QueryResult = { data: unknown; error: DbError | null }
type TableName = 'sessions' | 'spaces' | 'space_members' | 'voyages'
type Filter = { column: string; value: unknown; op: 'eq' | 'in' }

interface SessionRow { id: string; user_id: string | null; voyage_id: string | null; space_id: string | null; updated_at: string | null }
interface SpaceRow { id: string; kind: string; voyage_id: string | null; ai_present: boolean; created_by: string | null; created_at: string | null }
interface SpaceMemberRow { space_id: string; user_id: string; state: 'invited' | 'active' | 'left' }
interface VoyageRow { id: string; slug: string }

const db = {
  sessions: new Map<string, SessionRow>(),
  spaces: new Map<string, SpaceRow>(),
  space_members: new Map<string, SpaceMemberRow>(),
  voyages: new Map<string, VoyageRow>(),
}

let nextSpace = 1
const originalHousehold = process.env.HOUSEHOLD_SHARE_VOYAGE

const resetDb = () => {
  db.sessions.clear()
  db.spaces.clear()
  db.space_members.clear()
  db.voyages.clear()
  nextSpace = 1
  delete process.env.HOUSEHOLD_SHARE_VOYAGE
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const tableRows = (table: TableName): Array<Record<string, unknown>> => {
  if (table === 'sessions') return Array.from(db.sessions.values()) as unknown as Array<Record<string, unknown>>
  if (table === 'spaces') return Array.from(db.spaces.values()) as unknown as Array<Record<string, unknown>>
  if (table === 'voyages') return Array.from(db.voyages.values()) as unknown as Array<Record<string, unknown>>
  return Array.from(db.space_members.values()) as unknown as Array<Record<string, unknown>>
}

const memberKey = (row: Pick<SpaceMemberRow, 'space_id' | 'user_id'>) => `${row.space_id}:${row.user_id}`

class FakeQuery implements PromiseLike<QueryResult> {
  private action: 'select' | 'insert' | 'update' | 'upsert' = 'select'
  private filters: Filter[] = []
  private payload: unknown
  private orderBy: { column: string; ascending: boolean } | null = null
  private rowLimit: number | null = null

  constructor(private readonly table: TableName) {}

  select(_columns: string) { return this }
  eq(column: string, value: unknown) { this.filters.push({ column, value, op: 'eq' }); return this }
  in(column: string, value: unknown[]) { this.filters.push({ column, value, op: 'in' }); return this }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true }; return this
  }
  limit(count: number) { this.rowLimit = count; return this }
  insert(payload: unknown) { this.action = 'insert'; this.payload = payload; return this }
  update(payload: unknown) { this.action = 'update'; this.payload = payload; return this }
  upsert(payload: unknown, _options?: unknown) { this.action = 'upsert'; this.payload = payload; return this }
  maybeSingle(): Promise<QueryResult> { return this.execute(true) }
  single(): Promise<QueryResult> { return this.execute(true) }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private matches(row: Record<string, unknown>) {
    return this.filters.every((filter) => {
      if (filter.op === 'in') return (filter.value as unknown[]).includes(row[filter.column])
      return row[filter.column] === filter.value
    })
  }

  private execute(single = false): Promise<QueryResult> {
    if (this.action === 'insert') return Promise.resolve(this.insertRows(single))
    if (this.action === 'update') return Promise.resolve(this.updateRows())
    if (this.action === 'upsert') return Promise.resolve(this.upsertRows())

    let rows = tableRows(this.table).filter((row) => this.matches(row))
    if (this.orderBy) {
      const { column, ascending } = this.orderBy
      rows = rows.sort((a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')))
      if (!ascending) rows.reverse()
    }
    if (this.rowLimit !== null) rows = rows.slice(0, this.rowLimit)
    const data = rows.map(clone)
    return Promise.resolve({ data: single ? data[0] ?? null : data, error: null })
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
        created_at: row.created_at ?? `2026-07-09T00:00:0${nextSpace}.000Z`,
      }
      db.spaces.set(id, space)
      return clone(space)
    })
    return { data: single ? inserted[0] : inserted, error: null }
  }

  private updateRows(): QueryResult {
    const patch = this.payload as Record<string, unknown>
    const rows = tableRows(this.table).filter((row) => this.matches(row))
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

const loadModules = async () => {
  vi.resetModules()
  vi.doMock('@/lib/supabase/admin', () => ({ getAdminClient: () => fakeAdmin }))
  vi.doMock('@/lib/debug', () => ({ log: { api: vi.fn() } }))
  const room = await import('./room')
  const invites = await import('./invites')
  return { ...room, ...invites }
}

const seedVoyage = () => {
  db.voyages.set('voyage-1', { id: 'voyage-1', slug: 'fambam' })
  db.sessions.set('isaac-session', { id: 'isaac-session', user_id: 'isaac', voyage_id: 'voyage-1', space_id: null, updated_at: '2026-07-09T00:00:01.000Z' })
  db.sessions.set('vanessa-session', { id: 'vanessa-session', user_id: 'vanessa', voyage_id: 'voyage-1', space_id: null, updated_at: '2026-07-09T00:00:02.000Z' })
}

describe('room invitations', () => {
  beforeEach(() => {
    resetDb()
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalHousehold === undefined) delete process.env.HOUSEHOLD_SHARE_VOYAGE
    else process.env.HOUSEHOLD_SHARE_VOYAGE = originalHousehold
  })

  it('invites without adding the invitee to active room fan-out', async () => {
    seedVoyage()
    const { getRoom, inviteToRoom } = await loadModules()

    const invite = await inviteToRoom('isaac-session', 'vanessa')
    const spaceId = invite.spaceId ?? ''

    expect(invite).toEqual({ state: 'invited', spaceId: 'space-1' })
    expect(db.space_members.get(`${spaceId}:isaac`)?.state).toBe('active')
    expect(db.space_members.get(`${spaceId}:vanessa`)?.state).toBe('invited')
    await expect(getRoom('isaac-session')).resolves.toEqual({ roomPeople: [], aiPresent: false })
  })

  it('accepts reciprocally and links both sessions to the shared space', async () => {
    seedVoyage()
    const { getRoom, inviteToRoom, linkPendingSpace } = await loadModules()

    const invite = await inviteToRoom('isaac-session', 'vanessa')
    const link = await linkPendingSpace('vanessa-session', 'vanessa', 'voyage-1')

    expect(link).toEqual({ linked: true, spaceId: invite.spaceId, wasInvited: true })
    expect(db.space_members.get(`${invite.spaceId}:vanessa`)?.state).toBe('active')
    expect(db.sessions.get('vanessa-session')?.space_id).toBe(invite.spaceId)
    await expect(getRoom('vanessa-session')).resolves.toEqual({ roomPeople: ['isaac'], aiPresent: false })
    await expect(getRoom('isaac-session')).resolves.toEqual({ roomPeople: ['vanessa'], aiPresent: false })
  })

  it('auto-accepts household voyage invites and links the latest invitee session', async () => {
    seedVoyage()
    process.env.HOUSEHOLD_SHARE_VOYAGE = 'fambam'
    const { inviteToRoom } = await loadModules()

    const invite = await inviteToRoom('isaac-session', 'vanessa')

    expect(invite).toEqual({ state: 'active', spaceId: 'space-1' })
    expect(db.space_members.get('space-1:vanessa')?.state).toBe('active')
    expect(db.sessions.get('vanessa-session')?.space_id).toBe('space-1')
  })

  it('re-enters a left member as invited without sticking on left', async () => {
    seedVoyage()
    const { inviteToRoom, removeRoomPerson } = await loadModules()

    const firstInvite = await inviteToRoom('isaac-session', 'vanessa')
    await removeRoomPerson('isaac-session', 'vanessa')
    expect(db.space_members.get(`${firstInvite.spaceId}:vanessa`)?.state).toBe('left')

    const secondInvite = await inviteToRoom('isaac-session', 'vanessa')

    expect(secondInvite).toEqual({ state: 'invited', spaceId: firstInvite.spaceId })
    expect(db.space_members.get(`${firstInvite.spaceId}:vanessa`)?.state).toBe('invited')
  })
})
