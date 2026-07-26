import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuthResponse: vi.fn(),
  sharePrivateVoyagerReply: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ requireAuthResponse: mocks.requireAuthResponse }))
vi.mock('@/lib/messaging/share', () => ({
  sharePrivateVoyagerReply: mocks.sharePrivateVoyagerReply,
}))

import { POST } from './route'

const request = () => new Request('http://localhost/api/messages/share', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    sourceEventId: 'private-event-1',
    conversationId: 'conversation-1',
  }),
})

describe('POST /api/messages/share', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuthResponse.mockResolvedValue('user-isaac')
  })

  it('returns 201 with created publication status', async () => {
    mocks.sharePrivateVoyagerReply.mockResolvedValue({
      ok: true,
      eventId: 'shared-event-1',
      status: 'created',
    })
    const response = await POST(request())
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      eventId: 'shared-event-1',
      status: 'created',
    })
  })

  it('returns 200 with the same event for an idempotent replay', async () => {
    mocks.sharePrivateVoyagerReply.mockResolvedValue({
      ok: true,
      eventId: 'shared-event-1',
      status: 'replayed',
    })
    const response = await POST(request())
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      eventId: 'shared-event-1',
      status: 'replayed',
    })
  })

  it.each([
    ['source_not_shareable', 403],
    ['session_access_denied', 403],
    ['not_active_in_room', 403],
    ['room_has_no_audience', 409],
    ['write_failed', 500],
  ] as const)('maps %s to HTTP %s', async (code, status) => {
    mocks.sharePrivateVoyagerReply.mockResolvedValue({ ok: false, code })
    const response = await POST(request())
    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual({ error: code })
  })
})
