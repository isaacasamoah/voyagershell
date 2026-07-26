import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadRoomAndInvites,
  resetRoomDb,
  roomDb as db,
  rpcCalls,
  seedVoyageRoom,
} from './room-test-fixture'

describe('room invite target identity', () => {
  beforeEach(() => {
    resetRoomDb()
    vi.clearAllMocks()
  })

  it('transitions the exact room represented by the selected knock', async () => {
    seedVoyageRoom()
    const { inviteToRoom, respondToRoomInvite } = await loadRoomAndInvites()
    const older = await inviteToRoom('isaac-session', 'isaac', 'vanessa')
    db.sessions.get('isaac-session')!.space_id = null
    const newer = await inviteToRoom('isaac-session', 'isaac', 'vanessa')
    if (!older.spaceId) throw new Error('test invite did not return an exact room')

    const response = await respondToRoomInvite(
      'vanessa-session',
      'vanessa',
      true,
      older.spaceId,
    )

    expect(response).toEqual({
      responded: true,
      accepted: true,
      spaceId: older.spaceId,
      transition: 'accepted',
    })
    expect(db.space_members.get(`${older.spaceId}:vanessa`)?.state).toBe('active')
    expect(db.space_members.get(`${newer.spaceId}:vanessa`)?.state).toBe('invited')
    expect(rpcCalls).toContainEqual({
      name: 'transition_room_invite',
      args: expect.objectContaining({ p_space_id: older.spaceId }),
    })
  })
})
