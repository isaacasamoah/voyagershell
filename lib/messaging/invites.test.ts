import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  emptyRpcResults,
  loadRoomAndInvites as loadModules,
  resetRoomDb,
  roomDb as db,
  rpcCalls,
  rpcErrors,
  seedVoyageRoom as seedVoyage,
} from './room-test-fixture'

const originalHousehold = process.env.HOUSEHOLD_SHARE_VOYAGE
const exactSpaceId = (invite: { spaceId: string | null }) => {
  if (!invite.spaceId) throw new Error('test invite did not return an exact room')
  return invite.spaceId
}

describe('room invitations', () => {
  beforeEach(() => {
    resetRoomDb()
    delete process.env.HOUSEHOLD_SHARE_VOYAGE
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalHousehold === undefined) delete process.env.HOUSEHOLD_SHARE_VOYAGE
    else process.env.HOUSEHOLD_SHARE_VOYAGE = originalHousehold
  })

  it('leaves an invitation untouched during ordinary message flow', async () => {
    seedVoyage()
    const { getRoom, inviteToRoom } = await loadModules()

    const invite = await inviteToRoom('isaac-session', 'isaac', 'vanessa')
    const spaceId = invite.spaceId ?? ''

    expect(invite).toEqual({ state: 'invited', spaceId: 'space-1' })
    expect(db.space_members.get(`${spaceId}:isaac`)?.state).toBe('active')
    expect(db.space_members.get(`${spaceId}:vanessa`)?.state).toBe('invited')
    await expect(getRoom('isaac-session', 'isaac')).resolves.toEqual({ roomPeople: [], aiPresent: true, spaceId: 'space-1' })

    // Room reads and ordinary message handling do not invoke the explicit
    // response transition, so neither membership nor audience can change.
    await expect(getRoom('vanessa-session', 'vanessa')).resolves.toEqual({ roomPeople: [], aiPresent: true, spaceId: null })
    expect(db.space_members.get(`${spaceId}:vanessa`)?.state).toBe('invited')
    expect(db.sessions.get('vanessa-session')?.space_id).toBeNull()
    expect(rpcCalls).toContainEqual({ name: 'create_room_invite', args: {
      p_session_id: 'isaac-session', p_inviter_user_id: 'isaac', p_invitee_user_id: 'vanessa',
    } })
  })

  it('fails closed when the atomic invite transition errors or returns no committed row', async () => {
    seedVoyage()
    const { inviteToRoom } = await loadModules()
    rpcErrors.set('create_room_invite', 'forced failure')
    await expect(inviteToRoom('isaac-session', 'isaac', 'vanessa'))
      .rejects.toThrow('room_invite_create_failed:forced failure')
    expect(db.spaces).toHaveLength(0)
    rpcErrors.clear(); emptyRpcResults.add('create_room_invite')
    await expect(inviteToRoom('isaac-session', 'isaac', 'vanessa'))
      .rejects.toThrow('room_invite_create_empty_result')
    expect(db.spaces).toHaveLength(0)
  })

  it('keeps invited and active re-invites idempotent in the same room', async () => {
    seedVoyage()
    const { inviteToRoom } = await loadModules()

    const first = await inviteToRoom('isaac-session', 'isaac', 'vanessa')
    const repeated = await inviteToRoom('isaac-session', 'isaac', 'vanessa')
    expect(repeated).toEqual(first)
    expect(db.spaces).toHaveLength(1)

    db.space_members.get(`${first.spaceId}:vanessa`)!.state = 'active'
    await expect(inviteToRoom('isaac-session', 'isaac', 'vanessa')).resolves.toEqual({
      state: 'active',
      spaceId: first.spaceId,
    })
    expect(db.spaces).toHaveLength(1)
  })

  it('fails closed when an invite response has no committed result row', async () => {
    seedVoyage()
    const { respondToRoomInvite } = await loadModules()
    emptyRpcResults.add('transition_room_invite')

    await expect(respondToRoomInvite('vanessa-session', 'vanessa', true, 'space-1'))
      .rejects.toThrow('room_invite_transition_empty_result')
  })

  it('does not let a removed member use a stale session pointer to invite or rejoin', async () => {
    seedVoyage()
    db.sessions.get('isaac-session')!.space_id = 'space-1'
    db.spaces.set('space-1', {
      id: 'space-1',
      kind: 'room',
      voyage_id: 'voyage-1',
      ai_present: true,
      created_by: 'vanessa',
      created_at: '2026-07-09T00:00:00.000Z',
    })
    db.space_members.set('space-1:isaac', { space_id: 'space-1', user_id: 'isaac', state: 'left' })
    db.space_members.set('space-1:vanessa', { space_id: 'space-1', user_id: 'vanessa', state: 'active' })

    const { inviteToRoom } = await loadModules()
    await expect(inviteToRoom('isaac-session', 'isaac', 'vanessa')).resolves.toEqual({
      state: 'denied',
      spaceId: 'space-1',
    })
    expect(db.space_members.get('space-1:isaac')?.state).toBe('left')
    expect(db.space_members.get('space-1:vanessa')?.state).toBe('active')
  })

  it('accepts explicitly and links the responding session to the shared space', async () => {
    seedVoyage()
    const { getRoom, inviteToRoom, respondToRoomInvite } = await loadModules()

    const invite = await inviteToRoom('isaac-session', 'isaac', 'vanessa')
    const response = await respondToRoomInvite(
      'vanessa-session', 'vanessa', true, exactSpaceId(invite),
    )

    expect(response).toEqual({ responded: true, accepted: true, spaceId: invite.spaceId,
      transition: 'accepted' })
    expect(db.space_members.get(`${invite.spaceId}:vanessa`)?.state).toBe('active')
    expect(db.sessions.get('vanessa-session')?.space_id).toBe(invite.spaceId)
    await expect(getRoom('vanessa-session', 'vanessa')).resolves.toEqual({ roomPeople: ['isaac'], aiPresent: true, spaceId: invite.spaceId })
    await expect(getRoom('isaac-session', 'isaac')).resolves.toEqual({ roomPeople: ['vanessa'], aiPresent: true, spaceId: invite.spaceId })
  })

  it('declines explicitly without linking the responding session', async () => {
    seedVoyage()
    const { inviteToRoom, respondToRoomInvite } = await loadModules()

    const invite = await inviteToRoom('isaac-session', 'isaac', 'vanessa')
    const response = await respondToRoomInvite(
      'vanessa-session', 'vanessa', false, exactSpaceId(invite),
    )

    expect(response).toEqual({ responded: true, accepted: false })
    expect(db.space_members.get(`${invite.spaceId}:vanessa`)?.state).toBe('left')
    expect(db.sessions.get('vanessa-session')?.space_id).toBeNull()
  })

  it('reports when there is no pending invite', async () => {
    seedVoyage()
    const { respondToRoomInvite } = await loadModules()

    await expect(
      respondToRoomInvite('vanessa-session', 'vanessa', true, 'space-missing'),
    ).resolves.toEqual({
      responded: false,
      reason: 'no_pending_invite',
    })
    expect(db.sessions.get('vanessa-session')?.space_id).toBeNull()
  })

  it('re-invites after a decline so consent can be given later', async () => {
    seedVoyage()
    const { inviteToRoom, respondToRoomInvite } = await loadModules()

    const firstInvite = await inviteToRoom('isaac-session', 'isaac', 'vanessa')
    await respondToRoomInvite(
      'vanessa-session', 'vanessa', false, exactSpaceId(firstInvite),
    )
    expect(db.space_members.get(`${firstInvite.spaceId}:vanessa`)?.state).toBe('left')
    const secondInvite = await inviteToRoom('isaac-session', 'isaac', 'vanessa')

    expect(secondInvite).toEqual({ state: 'invited', spaceId: firstInvite.spaceId })
    expect(db.space_members.get(`${firstInvite.spaceId}:vanessa`)?.state).toBe('invited')
    expect(db.sessions.get('vanessa-session')?.space_id).toBeNull()
  })

  it('does not synthesize a room identity from other pending invitations', async () => {
    seedVoyage()
    const { inviteToRoom, respondToRoomInvite } = await loadModules()

    const older = await inviteToRoom('isaac-session', 'isaac', 'vanessa')
    const isaacSession = db.sessions.get('isaac-session')
    if (isaacSession) isaacSession.space_id = null
    const newer = await inviteToRoom('isaac-session', 'isaac', 'vanessa')
    const response = await respondToRoomInvite(
      'vanessa-session', 'vanessa', true, 'space-missing',
    )

    expect(response).toEqual({ responded: false, reason: 'no_pending_invite' })
    expect(db.space_members.get(`${older.spaceId}:vanessa`)?.state).toBe('invited')
    expect(db.space_members.get(`${newer.spaceId}:vanessa`)?.state).toBe('invited')
    expect(db.sessions.get('vanessa-session')?.space_id).toBeNull()
  })

  it('accepts an invite on the responding session\'s own space (self-space not excluded)', async () => {
    seedVoyage()
    const { getRoom, inviteToRoom, respondToRoomInvite } = await loadModules()

    const invite = await inviteToRoom('isaac-session', 'isaac', 'vanessa')
    // Vanessa's session is already linked to the invited space while she is
    // still 'invited' — the click must still promote her, not strand her.
    const vanessaSession = db.sessions.get('vanessa-session')
    if (vanessaSession) vanessaSession.space_id = invite.spaceId ?? null

    const response = await respondToRoomInvite(
      'vanessa-session', 'vanessa', true, exactSpaceId(invite),
    )

    expect(response).toEqual({ responded: true, accepted: true, spaceId: invite.spaceId,
      transition: 'accepted' })
    expect(db.space_members.get(`${invite.spaceId}:vanessa`)?.state).toBe('active')
    await expect(getRoom('vanessa-session', 'vanessa')).resolves.toEqual({ roomPeople: ['isaac'], aiPresent: true, spaceId: invite.spaceId })
  })

  it('knocks even in a household voyage — HOUSEHOLD_SHARE_VOYAGE grants no social auto-accept', async () => {
    seedVoyage()
    process.env.HOUSEHOLD_SHARE_VOYAGE = 'fambam'
    const { inviteToRoom } = await loadModules()

    const invite = await inviteToRoom('isaac-session', 'isaac', 'vanessa')

    expect(invite).toEqual({ state: 'invited', spaceId: 'space-1' })
    expect(db.space_members.get('space-1:vanessa')?.state).toBe('invited')
    expect(db.sessions.get('vanessa-session')?.space_id).toBeNull()
  })

  it('re-enters an already-active room through the canonical invite response', async () => {
    seedVoyage()
    const { inviteToRoom, respondToRoomInvite } = await loadModules()

    const invite = await inviteToRoom('isaac-session', 'isaac', 'vanessa')
    await respondToRoomInvite(
      'vanessa-session', 'vanessa', true, exactSpaceId(invite),
    )
    const spaceId = db.sessions.get('vanessa-session')?.space_id
    // a fresh session in the same voyage re-enters by choice
    db.sessions.set('vanessa-session-2', { id: 'vanessa-session-2', user_id: 'vanessa', voyage_id: 'voyage-1', space_id: null, updated_at: '2026-07-10T00:00:03.000Z' })

    await expect(
      respondToRoomInvite(
        'vanessa-session-2', 'vanessa', true, exactSpaceId(invite),
      ),
    ).resolves.toEqual({
      responded: true,
      accepted: true,
      spaceId,
      transition: 'entered',
    })
    expect(db.sessions.get('vanessa-session-2')?.space_id).toBe(spaceId)
  })
})
