import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionAccessError } from '@/lib/conversation/session-authority'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveSessionVoyage: vi.fn(),
  getFeed: vi.fn(),
  getDisplayRoom: vi.fn(),
  runTurn: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ requireAuthResponse: mocks.auth }))
vi.mock('@/lib/voyage/session', () => ({
  resolveSessionVoyage: mocks.resolveSessionVoyage,
}))
vi.mock('@/lib/messaging/feed', () => ({ getFeed: mocks.getFeed }))
vi.mock('@/lib/messaging/room', () => ({
  getDisplayRoom: mocks.getDisplayRoom,
}))
vi.mock('@/lib/harness', () => ({
  createVercelHost: () => ({}),
  runTurn: mocks.runTurn,
}))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { display_name: 'Removed Owner' },
            error: null,
          }),
        }),
      }),
    }),
  }),
}))

import { POST as postChat } from './chat/route'
import { GET as getFeedRoute } from './feed/route'
import { GET as getRoomRoute } from './room/route'

const ownerId = '10000000-0000-4000-8000-000000000081'
const sessionId = '50000000-0000-4000-8000-000000000081'
const url = (path: string) =>
  `http://localhost${path}?conversationId=${sessionId}`

const chatRequest = () => new Request('http://localhost/api/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    conversationId: sessionId,
    messages: [{ role: 'user', content: 'Continue privately.' }],
  }),
})

describe('removed room member route behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    mocks.auth.mockResolvedValue(ownerId)
    mocks.resolveSessionVoyage.mockResolvedValue('fambam')
    mocks.getFeed.mockResolvedValue([])
    mocks.getDisplayRoom.mockResolvedValue({ people: [], aiPresent: true })
    mocks.runTurn.mockResolvedValue({ kind: 'empty' })
  })

  afterAll(() => vi.unstubAllEnvs())

  it('continues the removed owner chat in their owned voyage scope', async () => {
    const response = await postChat(chatRequest())

    expect(response.status).toBe(200)
    expect(mocks.runTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ownerId,
        conversationId: sessionId,
        voyageSlug: 'fambam',
        newMessage: 'Continue privately.',
      }),
      expect.anything(),
    )
  })

  it('returns the removed owner private feed instead of a session 403', async () => {
    const response = await getFeedRoute(new Request(url('/api/feed')))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ events: [] })
    expect(mocks.getFeed).toHaveBeenCalledWith(ownerId, sessionId)
  })

  it('returns an empty room so stale membership cannot remain shared', async () => {
    const response = await getRoomRoute(new Request(url('/api/room')))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      room: { people: [], aiPresent: true },
    })
    expect(mocks.getDisplayRoom).toHaveBeenCalledWith(sessionId, ownerId)
  })

  it('still denies a different user resolving the owned session', async () => {
    mocks.auth.mockResolvedValue('10000000-0000-4000-8000-000000000082')
    mocks.resolveSessionVoyage.mockRejectedValue(new SessionAccessError())

    const response = await getRoomRoute(new Request(url('/api/room')))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'session_access_denied',
    })
    expect(mocks.getDisplayRoom).not.toHaveBeenCalled()
  })
})
