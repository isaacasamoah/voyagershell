import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  updateEventEmbedding: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ rpc: mocks.rpc }),
}))
vi.mock('@/lib/knowledge/events', () => ({
  updateEventEmbedding: mocks.updateEventEmbedding,
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
    mocks.updateEventEmbedding.mockResolvedValue(undefined)
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
    expect(mocks.updateEventEmbedding).toHaveBeenCalledWith(
      'shared-event-1',
      'The exact private answer.',
    )
  })

  it('returns the canonical event on replay and retries best-effort embedding', async () => {
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
    expect(mocks.updateEventEmbedding).toHaveBeenCalledTimes(1)
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
    expect(mocks.updateEventEmbedding).not.toHaveBeenCalled()
  })

  it('fails closed on a malformed RPC result', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    await expect(callShare()).resolves.toEqual({ ok: false, code: 'write_failed' })
  })
})
