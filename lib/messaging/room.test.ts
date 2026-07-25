import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadRoomModule,
  loadRoomContextModule,
  resetRoomDb,
  rpcCalls,
  roomDb as db,
} from './room-test-fixture'

describe('space-backed room API', () => {
  beforeEach(() => {
    resetRoomDb()
    vi.clearAllMocks()
  })

  it('shows the same shared space from each member session, excluding self', async () => {
    db.sessions.set('session-a', { id: 'session-a', user_id: 'user-a', voyage_id: 'voyage-1', space_id: 'space-1' })
    db.sessions.set('session-b', { id: 'session-b', user_id: 'user-b', voyage_id: 'voyage-1', space_id: 'space-1' })
    db.spaces.set('space-1', { id: 'space-1', kind: 'room', voyage_id: 'voyage-1', ai_present: false, created_by: 'user-a' })
    db.space_members.set('space-1:user-a', { space_id: 'space-1', user_id: 'user-a', state: 'active' })
    db.space_members.set('space-1:user-b', { space_id: 'space-1', user_id: 'user-b', state: 'active' })

    const { getRoom } = await loadRoomModule()

    await expect(getRoom('session-a', 'user-a')).resolves.toEqual({ roomPeople: ['user-b'], aiPresent: false, spaceId: 'space-1' })
    await expect(getRoom('session-b', 'user-b')).resolves.toEqual({ roomPeople: ['user-a'], aiPresent: false, spaceId: 'space-1' })
  })

  it('creates a private room through the session authority boundary', async () => {
    db.sessions.set('session-a', {
      id: 'session-a',
      user_id: 'user-a',
      voyage_id: 'voyage-1',
      space_id: null,
    })

    const { getRoom, setAiPresent } = await loadRoomModule()
    const session = db.sessions.get('session-a')
    if (!session) throw new Error('missing test session')
    await setAiPresent('session-a', 'user-a', true)
    const spaceId = session.space_id
    const room = await getRoom('session-a', 'user-a')

    expect(spaceId).toBe('space-1')
    expect(db.space_members.get(`${spaceId}:user-a`)?.state).toBe('active')
    expect(db.spaces.get(spaceId ?? '')?.ai_present).toBe(true)
    expect(room).toEqual({ roomPeople: [], aiPresent: true, spaceId: 'space-1' })
  })

  it('exposes only active space members as roomPeople for message fan-out', async () => {
    db.sessions.set('session-a', { id: 'session-a', user_id: 'user-a', voyage_id: 'voyage-1', space_id: 'space-1' })
    db.spaces.set('space-1', { id: 'space-1', kind: 'room', voyage_id: 'voyage-1', ai_present: true, created_by: 'user-a' })
    db.space_members.set('space-1:user-a', { space_id: 'space-1', user_id: 'user-a', state: 'active' })
    db.space_members.set('space-1:user-b', { space_id: 'space-1', user_id: 'user-b', state: 'active' })
    db.space_members.set('space-1:user-c', { space_id: 'space-1', user_id: 'user-c', state: 'left' })

    const { getRoom } = await loadRoomModule()

    await expect(getRoom('session-a', 'user-a')).resolves.toEqual({ roomPeople: ['user-b'], aiPresent: true, spaceId: 'space-1' })
  })

  it('removes members by marking them left and updates Voyager presence on spaces', async () => {
    db.sessions.set('session-a', { id: 'session-a', user_id: 'user-a', voyage_id: 'voyage-1', space_id: 'space-1' })
    db.spaces.set('space-1', { id: 'space-1', kind: 'room', voyage_id: 'voyage-1', ai_present: false, created_by: 'user-a' })
    db.space_members.set('space-1:user-a', { space_id: 'space-1', user_id: 'user-a', state: 'active' })
    db.space_members.set('space-1:user-b', { space_id: 'space-1', user_id: 'user-b', state: 'active' })

    const { getRoom, removeRoomPerson, setAiPresent } = await loadRoomModule()

    const result = await removeRoomPerson('session-a', 'user-a', 'user-b')
    expect(result.removed).toBe(true)
    expect(db.space_members.get('space-1:user-b')?.state).toBe('left')
    await expect(getRoom('session-a', 'user-a')).resolves.toEqual({ roomPeople: [], aiPresent: false, spaceId: 'space-1' })

    await setAiPresent('session-a', 'user-a', true)
    expect(db.spaces.get('space-1')?.ai_present).toBe(true)
  })

  it('treats a stale session space pointer as history, not room authority', async () => {
    db.sessions.set('session-a', { id: 'session-a', user_id: 'user-a', voyage_id: 'voyage-1', space_id: 'space-1' })
    db.sessions.set('session-b', { id: 'session-b', user_id: 'user-b', voyage_id: 'voyage-1', space_id: 'space-1' })
    db.spaces.set('space-1', { id: 'space-1', kind: 'room', voyage_id: 'voyage-1', ai_present: true, created_by: 'user-a' })
    db.space_members.set('space-1:user-a', { space_id: 'space-1', user_id: 'user-a', state: 'active' })
    db.space_members.set('space-1:user-b', { space_id: 'space-1', user_id: 'user-b', state: 'left' })

    const { getActiveMemberIds, getRoom, removeRoomPerson, setAiPresent } = await loadRoomModule()
    const { getRoomRoster } = await loadRoomContextModule()

    await expect(getRoom('session-b', 'user-b')).resolves.toEqual({ roomPeople: [], aiPresent: true, spaceId: null })
    await expect(getRoomRoster('session-b', 'user-b')).resolves.toEqual({
      active: [],
      invited: [],
      aiPresent: true,
    })
    await expect(getActiveMemberIds('session-b', 'user-b')).resolves.toEqual(['user-b'])
    expect(rpcCalls.some((call) => call.name === 'get_effective_space_member_ids')).toBe(true)
    await expect(setAiPresent('session-b', 'user-b', false)).resolves.toBe(false)

    const removal = await removeRoomPerson('session-b', 'user-b', 'user-a')
    expect(removal).toEqual({
      removed: false,
      room: { roomPeople: [], aiPresent: true, spaceId: null },
    })
    expect(db.space_members.get('space-1:user-a')?.state).toBe('active')
  })
})

// Room truth (2026-07-11): the model receives the code-attested roster.
describe('describeRoomForPrompt', () => {
  it('explicitly overrides historical room context when nobody else is in or invited', async () => {
    const { describeRoomForPrompt } = await loadRoomContextModule()
    const line = describeRoomForPrompt({ active: [], invited: [], aiPresent: true })
    expect(line).toContain('no other people are in this room')
    expect(line).toContain('never infer current membership from conversation history')
  })

  it('names active and invited distinctly, marking invited as unable to see messages', async () => {
    const { describeRoomForPrompt } = await loadRoomContextModule()
    const line = describeRoomForPrompt({ active: ['elisheya'], invited: ['tom'], aiPresent: true })
    expect(line).toContain('in the room: elisheya')
    expect(line).toContain('invited but NOT joined')
    expect(line).toContain('tom')
    expect(line).toContain('cannot see these messages')
  })
})
