import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedEventRow } from '@/lib/messaging/feed-rows'

const mocks = vi.hoisted(() => ({
  queryScopedEvents: vi.fn(),
}))

vi.mock('@/lib/messaging/feed-queries', () => ({
  queryScopedEvents: mocks.queryScopedEvents,
}))

import {
  composeContextFromStream,
  renderMessagesForModel,
} from './stream-context'

const row = (overrides: Partial<FeedEventRow>): FeedEventRow => ({
  id: 'event-1',
  event_type: 'conversation',
  content: 'hello',
  created_at: '2026-07-17T00:00:00.000Z',
  metadata: { session_id: 'conversation-1' },
  source_ref: { conversation_id: 'conversation-1', role: 'user' },
  actor_type: 'user',
  user_id: 'user-1',
  participants: ['user-1'],
  voyage_slug: null,
  ...overrides,
})

describe('composeContextFromStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps raw content and renders another human with attribution for the model path', async () => {
    mocks.queryScopedEvents.mockResolvedValue([
      row({
        id: 'room-message',
        event_type: 'message',
        content: 'the fix is ready',
        metadata: {
          session_id: 'conversation-1',
          sender_display_name: 'Vanessa',
          sender_user_id: 'user-2',
        },
        source_ref: { conversation_id: 'conversation-1', role: 'user' },
        user_id: 'user-2',
        participants: ['user-1', 'user-2'],
        voyage_slug: 'launch',
      }),
    ])

    const composed = await composeContextFromStream('user-1', 'conversation-1', 'launch')

    expect(composed[0]).toMatchObject({
      role: 'user',
      content: 'the fix is ready',
      authorDisplayName: 'Vanessa',
      authorUserId: 'user-2',
      isPrivate: false,
    })
    expect(renderMessagesForModel(composed)[0].content).toBe('[Vanessa]: the fix is ready')
  })

  it('keeps real asides scoped to the owner and does not mark ordinary solo turns private', async () => {
    const rows = [
      row({
        id: 'aside',
        content: 'private thought',
        metadata: { session_id: 'conversation-1', source: 'aside' },
      }),
      row({
        id: 'solo',
        content: 'ordinary solo turn',
        metadata: { session_id: 'conversation-1' },
      }),
    ]
    mocks.queryScopedEvents.mockImplementation(async (userId: string) => (
      rows.filter((item) => item.participants?.includes(userId))
    ))

    await expect(composeContextFromStream('user-2', 'conversation-1', null)).resolves.toEqual([])

    const composed = await composeContextFromStream('user-1', 'conversation-1', null)
    expect(composed.find((item) => item.id === 'aside')).toMatchObject({
      content: 'private thought',
      isPrivate: true,
    })
    expect(composed.find((item) => item.id === 'solo')).toMatchObject({
      content: 'ordinary solo turn',
      isPrivate: false,
    })
    expect(renderMessagesForModel(composed).find((item) => item.id === 'aside')?.content)
      .toBe('[PRIVATE]: private thought')
  })

  it('sorts ascending by created_at and id', async () => {
    mocks.queryScopedEvents.mockResolvedValue([
      row({ id: 'c', content: 'third', created_at: '2026-07-17T00:00:02.000Z' }),
      row({ id: 'b', content: 'second', created_at: '2026-07-17T00:00:01.000Z' }),
      row({ id: 'a', content: 'first', created_at: '2026-07-17T00:00:01.000Z' }),
    ])

    const composed = await composeContextFromStream('user-1', 'conversation-1', null)

    expect(composed.map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns display-safe raw content without model prefixes', async () => {
    mocks.queryScopedEvents.mockResolvedValue([
      row({
        id: 'aside',
        content: 'private thought',
        metadata: { session_id: 'conversation-1', source: 'aside' },
      }),
      row({
        id: 'room-message',
        event_type: 'message',
        content: 'ship it',
        metadata: {
          session_id: 'conversation-1',
          sender_display_name: 'Vanessa',
          sender_user_id: 'user-2',
        },
        source_ref: { conversation_id: 'conversation-1', role: 'user' },
        user_id: 'user-2',
        participants: ['user-1', 'user-2'],
      }),
    ])

    const composed = await composeContextFromStream('user-1', 'conversation-1', null)

    expect(composed.map((item) => item.content)).toEqual(['private thought', 'ship it'])
    expect(composed.some((item) => item.content.includes('[PRIVATE]:'))).toBe(false)
    expect(composed.some((item) => item.content.includes('[Vanessa]:'))).toBe(false)
  })
})
