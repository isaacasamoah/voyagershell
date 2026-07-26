import { vi } from 'vitest'
import type {
  Filter,
  QueryResult,
  SessionRow,
  SpaceMemberRow,
  SpaceRow,
  TableName,
  VoyageRow,
} from './room-test-types'
import { handleSessionRpc } from './room-session-rpc-test-fixture'

type RoomTableName = Exclude<TableName, 'sessions'>

export const roomDb = {
  sessions: new Map<string, SessionRow>(),
  spaces: new Map<string, SpaceRow>(),
  space_members: new Map<string, SpaceMemberRow>(),
  voyages: new Map<string, VoyageRow>(),
}

export const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
export const rpcErrors = new Map<string, string>()
export const emptyRpcResults = new Set<string>()
let nextSpace = 1
export const resetRoomDb = () => {
  roomDb.sessions.clear()
  roomDb.spaces.clear()
  roomDb.space_members.clear()
  roomDb.voyages.clear()
  rpcCalls.length = 0
  rpcErrors.clear()
  emptyRpcResults.clear()
  nextSpace = 1
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const tableRows = (table: RoomTableName): Array<Record<string, unknown>> => {
  if (table === 'spaces') return Array.from(roomDb.spaces.values()) as unknown as Array<Record<string, unknown>>
  if (table === 'voyages') return Array.from(roomDb.voyages.values()) as unknown as Array<Record<string, unknown>>
  return Array.from(roomDb.space_members.values()) as unknown as Array<Record<string, unknown>>
}

class FakeQuery implements PromiseLike<QueryResult> {
  private filters: Filter[] = []

  constructor(private readonly table: RoomTableName) {}
  select(_columns: string) { return this }
  eq(column: string, value: unknown) { this.filters.push({ column, value, op: 'eq' }); return this }
  in(column: string, value: unknown[]) { this.filters.push({ column, value, op: 'in' }); return this }
  maybeSingle(): Promise<QueryResult> { return this.execute(true) }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private matches(row: Record<string, unknown>) {
    return this.filters.every((filter) => filter.op === 'in'
      ? (filter.value as unknown[]).includes(row[filter.column])
      : row[filter.column] === filter.value)
  }

  private execute(single = false): Promise<QueryResult> {
    const rows = tableRows(this.table).filter((row) => this.matches(row))
    const data = rows.map(clone)
    return Promise.resolve({ data: single ? data[0] ?? null : data, error: null })
  }
}

const fakeAdmin = {
  from: (table: RoomTableName) => new FakeQuery(table),
  rpc: async (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args })
    const forcedError = rpcErrors.get(name)
    if (forcedError) return { data: null, error: { message: forcedError } }
    if (emptyRpcResults.has(name)) return { data: [], error: null }
    const sessionResult = handleSessionRpc(
      name,
      args,
      roomDb,
      () => `space-${nextSpace++}`,
    )
    if (sessionResult) return sessionResult
    if (name === 'create_room_invite') {
      const session = roomDb.sessions.get(String(args.p_session_id ?? ''))
      const inviter = String(args.p_inviter_user_id ?? '')
      const invitee = String(args.p_invitee_user_id ?? '')
      if (!session || session.user_id !== inviter || !invitee || invitee === inviter) {
        return { data: [{ invite_status: 'denied', invite_space_id: session?.space_id ?? null }], error: null }
      }
      let spaceId = session.space_id
      if (spaceId) {
        const inviterMember = roomDb.space_members.get(`${spaceId}:${inviter}`)
        if (inviterMember?.state !== 'active') {
          return { data: [{ invite_status: 'denied', invite_space_id: spaceId }], error: null }
        }
      } else {
        spaceId = `space-${nextSpace++}`
        roomDb.spaces.set(spaceId, { id: spaceId, kind: 'room', voyage_id: session.voyage_id,
          ai_present: true, created_by: inviter })
        roomDb.space_members.set(`${spaceId}:${inviter}`,
          { space_id: spaceId, user_id: inviter, state: 'active' })
        session.space_id = spaceId
      }
      const key = `${spaceId}:${invitee}`
      const member = roomDb.space_members.get(key)
      if (member?.state === 'active') {
        return { data: [{ invite_status: 'active', invite_space_id: spaceId }], error: null }
      }
      roomDb.space_members.set(key, { space_id: spaceId, user_id: invitee, state: 'invited' })
      return { data: [{ invite_status: 'invited', invite_space_id: spaceId }], error: null }
    }
    if (name === 'transition_room_invite') {
      const session = roomDb.sessions.get(String(args.p_session_id ?? ''))
      if (!session || session.user_id !== args.p_user_id) {
        return { data: [{ transition_status: 'denied', transition_space_id: null }], error: null }
      }
      if (!args.p_space_id) {
        return { data: [{ transition_status: 'no_pending_invite', transition_space_id: null }], error: null }
      }
      const spaceId = String(args.p_space_id)
      const space = roomDb.spaces.get(spaceId)
      const member = roomDb.space_members.get(`${spaceId}:${String(args.p_user_id ?? '')}`)
      if (!space || space.voyage_id !== session.voyage_id || !member) {
        return { data: [{ transition_status: 'no_pending_invite', transition_space_id: null }], error: null }
      }
      const eligible = args.p_action === 'decline'
        ? member.state === 'invited'
        : member.state === 'invited' || (member.state === 'active' && spaceId !== session.space_id)
      if (!eligible) {
        return { data: [{ transition_status: 'no_pending_invite', transition_space_id: null }], error: null }
      }
      if (args.p_action === 'decline') {
        member.state = 'left'
        return { data: [{ transition_status: 'declined', transition_space_id: member.space_id }], error: null }
      }
      const status = member.state === 'invited' ? 'accepted' : 'entered'
      member.state = 'active'; session.space_id = member.space_id
      return { data: [{ transition_status: status, transition_space_id: member.space_id }], error: null }
    }
    const members = Array.from(roomDb.space_members.values())
      .filter((member) => member.space_id === args.p_space_id && member.state === 'active')
    if (name === 'get_effective_space_member_ids') {
      return { data: members.map(({ user_id }) => ({ user_id })), error: null }
    }
    if (name === 'is_effective_space_member') {
      return { data: members.some((member) => member.user_id === args.p_user_id), error: null }
    }
    return { data: null, error: { message: `unexpected RPC: ${name}` } }
  },
}

const installMocks = () => {
  vi.resetModules()
  vi.doMock('@/lib/supabase/admin', () => ({ getAdminClient: () => fakeAdmin }))
  vi.doMock('@/lib/debug', () => ({ log: { api: vi.fn() } }))
}

export const loadRoomModule = async () => {
  installMocks()
  return import('./room')
}

export const loadRoomContextModule = async () => {
  installMocks()
  return import('./room-context')
}

export const loadRoomAndInvites = async () => {
  installMocks()
  const room = await import('./room')
  const invites = await import('./invites')
  return { ...room, ...invites }
}

export const seedVoyageRoom = () => {
  roomDb.voyages.set('voyage-1', { id: 'voyage-1', slug: 'fambam' })
  roomDb.sessions.set('isaac-session', {
    id: 'isaac-session', user_id: 'isaac', voyage_id: 'voyage-1', space_id: null,
    updated_at: '2026-07-09T00:00:01.000Z',
  })
  roomDb.sessions.set('vanessa-session', {
    id: 'vanessa-session', user_id: 'vanessa', voyage_id: 'voyage-1', space_id: null,
    updated_at: '2026-07-09T00:00:02.000Z',
  })
}
