import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createMessageEvent, fanOutDeliveries } = vi.hoisted(() => ({
  createMessageEvent: vi.fn(),
  fanOutDeliveries: vi.fn(),
}))

vi.mock('@/lib/knowledge/events', () => ({ createMessageEvent }))
vi.mock('@/lib/messaging/deliveries', () => ({ fanOutDeliveries }))

import { deliverRoomInvite } from './invites'

describe('room invite delivery identity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createMessageEvent.mockResolvedValue('event-1')
  })

  it('persists the exact room identity on every fresh invite knock', async () => {
    await deliverRoomInvite(
      'conversation-1',
      { userId: 'user-inviter', displayName: 'Isaac' },
      'user-invitee',
      'space-exact',
      'launch',
    )

    expect(createMessageEvent).toHaveBeenCalledWith(
      'conversation-1',
      'user',
      'Isaac invited you to a room — reply to join.',
      expect.objectContaining({
        source: 'invite',
        spaceId: 'space-exact',
        participants: ['user-invitee'],
        addressedTo: ['user-invitee'],
      }),
    )
    expect(fanOutDeliveries).toHaveBeenCalledWith('event-1', ['user-invitee'])
  })
})
