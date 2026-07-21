import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createMessageEvent: vi.fn(),
  fanOutDeliveries: vi.fn(),
  getActiveMemberIds: vi.fn(),
}))
const sourceResult = vi.hoisted(() => ({ data: null as unknown }))
const profileResult = vi.hoisted(() => ({ data: { display_name: 'Isaac', username: 'isaac' } as unknown }))

vi.mock('@/lib/knowledge', () => ({ createMessageEvent: mocks.createMessageEvent }))
vi.mock('@/lib/messaging/deliveries', () => ({ fanOutDeliveries: mocks.fanOutDeliveries }))
vi.mock('@/lib/messaging/room', () => ({ getActiveMemberIds: mocks.getActiveMemberIds }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      const result = table === 'knowledge_events' ? sourceResult : profileResult
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.maybeSingle = () => Promise.resolve(result)
      return builder
    },
  }),
}))

import { sharePrivateVoyagerReply } from './share'

const { createMessageEvent, fanOutDeliveries, getActiveMemberIds } = mocks

const privateReply = (overrides: Record<string, unknown> = {}) => ({
  id: 'private-event-1',
  event_type: 'conversation',
  actor_type: 'voyager',
  user_id: 'user-isaac',
  participants: ['user-isaac'],
  content: 'The exact private answer.',
  source_ref: { conversation_id: 'conversation-1', role: 'assistant' },
  ...overrides,
})

describe('sharePrivateVoyagerReply', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sourceResult.data = privateReply()
    profileResult.data = { display_name: 'Isaac', username: 'isaac' }
    getActiveMemberIds.mockResolvedValue(['user-isaac', 'user-elisheya'])
    createMessageEvent.mockResolvedValue('shared-event-1')
    fanOutDeliveries.mockResolvedValue(undefined)
  })

  it('promotes exact content into a new human room event with fresh recipients', async () => {
    const result = await sharePrivateVoyagerReply({
      sourceEventId: 'private-event-1',
      conversationId: 'conversation-1',
      userId: 'user-isaac',
      voyageSlug: 'launch',
    })

    expect(result).toEqual({ ok: true, eventId: 'shared-event-1' })
    expect(createMessageEvent).toHaveBeenCalledWith(
      'conversation-1',
      'user',
      'The exact private answer.',
      expect.objectContaining({
        userId: 'user-isaac',
        eventType: 'message',
        source: 'shared-voyager',
        participants: ['user-isaac', 'user-elisheya'],
        addressedTo: ['user-elisheya'],
        senderDisplayName: 'Isaac',
      }),
    )
    const publicOptions = createMessageEvent.mock.calls[0][3]
    expect(JSON.stringify(publicOptions)).not.toContain('private-event-1')
    expect(fanOutDeliveries).toHaveBeenCalledWith('shared-event-1', ['user-elisheya'])
  })

  it.each([
    ['another user owns the source', { user_id: 'user-elisheya' }],
    ['another participant can see the source', { participants: ['user-isaac', 'user-elisheya'] }],
    ['source belongs to another session', { source_ref: { conversation_id: 'conversation-2', role: 'assistant' } }],
    ['source role is not assistant', { source_ref: { conversation_id: 'conversation-1', role: 'user' } }],
    ['source is human-authored', { actor_type: 'user' }],
    ['source is already a room message', { event_type: 'message' }],
  ])('refuses when %s', async (_label, overrides) => {
    sourceResult.data = privateReply(overrides)
    const result = await sharePrivateVoyagerReply({
      sourceEventId: 'private-event-1',
      conversationId: 'conversation-1',
      userId: 'user-isaac',
      voyageSlug: 'launch',
    })
    expect(result).toEqual({ ok: false, code: 'source_not_shareable' })
    expect(createMessageEvent).not.toHaveBeenCalled()
  })

  it('refuses a share when nobody else is currently in the room', async () => {
    getActiveMemberIds.mockResolvedValue(['user-isaac'])
    const result = await sharePrivateVoyagerReply({
      sourceEventId: 'private-event-1',
      conversationId: 'conversation-1',
      userId: 'user-isaac',
      voyageSlug: 'launch',
    })
    expect(result).toEqual({ ok: false, code: 'room_has_no_audience' })
    expect(createMessageEvent).not.toHaveBeenCalled()
  })
})
