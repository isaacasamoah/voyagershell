import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ rpc: mocks.rpc }),
}))

import { sharePrivateVoyagerReply } from './share'

const callShare = () => sharePrivateVoyagerReply({
  sourceEventId: 'private-event-1',
  conversationId: 'conversation-1',
  userId: 'user-isaac',
})

describe('sharePrivateVoyagerReply — atomic promotion service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({
      data: [{
        shared_event_id: 'shared-event-1',
        status: 'created',
        shared_content: 'The exact private answer.',
      }],
      error: null,
    })
  })

  it('delegates the entire publication boundary to the service-only RPC', async () => {
    await expect(callShare()).resolves.toEqual({
      ok: true,
      eventId: 'shared-event-1',
      status: 'created',
    })
    expect(mocks.rpc).toHaveBeenCalledWith('promote_private_voyager_reply', {
      p_source_event_id: 'private-event-1',
      p_conversation_id: 'conversation-1',
      p_user_id: 'user-isaac',
    })
  })

  it('returns the canonical event on replay without a second write', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        shared_event_id: 'shared-event-1',
        status: 'replayed',
        shared_content: 'The exact private answer.',
      }],
      error: null,
    })

    await expect(callShare()).resolves.toEqual({
      ok: true,
      eventId: 'shared-event-1',
      status: 'replayed',
    })
  })

  it.each([
    ['share_session_access_denied', 'session_access_denied'],
    ['share_source_not_shareable', 'source_not_shareable'],
    ['share_not_active_in_room', 'not_active_in_room'],
    ['share_room_has_no_audience', 'room_has_no_audience'],
    ['database offline', 'write_failed'],
  ] as const)('maps RPC failure %s to %s', async (message, code) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message } })
    await expect(callShare()).resolves.toEqual({ ok: false, code })
  })

  it('fails closed on a malformed RPC result', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    await expect(callShare()).resolves.toEqual({ ok: false, code: 'write_failed' })
  })
})
