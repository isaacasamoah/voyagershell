import { describe, expect, it } from 'vitest'
import {
  mergeFeedEvent,
  shouldShowStreamingReply,
  sortFeedEvents,
  type FeedEvent,
} from './feed-types'

const event = (id: string, createdAt: string, patch: Partial<FeedEvent> = {}): FeedEvent => ({
  id,
  eventType: 'conversation',
  role: 'assistant',
  senderDisplayName: 'Voyager',
  senderUserId: null,
  content: id,
  createdAt,
  seen: true,
  deliveryId: null,
  ...patch,
})

describe('event-stream feed primitives', () => {
  it('orders out-of-order arrivals by createdAt', () => {
    const ordered = sortFeedEvents([
      event('assistant', '2026-07-09T10:03:00.000Z'),
      event('user', '2026-07-09T10:01:00.000Z', { role: 'user' }),
      event('human', '2026-07-09T10:02:00.000Z', { eventType: 'message', role: 'human' }),
    ])

    expect(ordered.map((item) => item.id)).toEqual(['user', 'human', 'assistant'])
  })

  it('keeps seen message events in the reloadable feed', () => {
    const ordered = sortFeedEvents([
      event('seen-message', '2026-07-09T10:01:00.000Z', {
        eventType: 'message',
        role: 'human',
        seen: true,
        deliveryId: 'delivery-1',
      }),
    ])

    expect(ordered).toHaveLength(1)
    expect(ordered[0].seen).toBe(true)
  })

  it('interleaves conversation and message events in one list', () => {
    const ordered = sortFeedEvents([
      event('voyager-turn', '2026-07-09T10:03:00.000Z'),
      event('peer-message', '2026-07-09T10:02:00.000Z', { eventType: 'message', role: 'human' }),
      event('my-turn', '2026-07-09T10:01:00.000Z', { role: 'user' }),
    ])

    expect(ordered.map((item) => `${item.eventType}:${item.id}`)).toEqual([
      'conversation:my-turn',
      'message:peer-message',
      'conversation:voyager-turn',
    ])
  })

  it('inserts live events at their createdAt position', () => {
    const current = [
      event('first', '2026-07-09T10:01:00.000Z'),
      event('third', '2026-07-09T10:03:00.000Z'),
    ]
    const next = mergeFeedEvent(current, event('second', '2026-07-09T10:02:00.000Z'))

    expect(next.map((item) => item.id)).toEqual(['first', 'second', 'third'])
  })

  it('shows the streaming reply until its persisted event lands, without duplicating it', () => {
    const reply = {
      id: 'streaming-assistant',
      content: 'final answer',
      startedAt: '2026-07-09T10:02:00.000Z',
    }
    const olderMatchingEvent = event('older', '2026-07-09T10:01:00.000Z', { content: 'final answer' })
    const settledEvent = event('settled', '2026-07-09T10:03:00.000Z', { content: 'final answer' })

    expect(shouldShowStreamingReply(reply, [olderMatchingEvent])).toBe(true)
    expect(shouldShowStreamingReply(reply, [olderMatchingEvent, settledEvent])).toBe(false)
  })
})
