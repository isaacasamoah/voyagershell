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

// F2 root-cause regression: the server persists `@voyager …` asides STRIPPED,
// so the optimistic settle must compare aside-stripped content on both sides —
// or the composer wedges into queue mode after every aside (2026-07-10, live).
import { shouldShowOptimisticUser, stripVoyagerAside, isVoyagerAside } from './feed-types'

describe('aside-aware optimistic settle', () => {
  it('strips the @voyager prefix exactly like the route', () => {
    expect(stripVoyagerAside('@voyager what is the almond tree idea?')).toBe('what is the almond tree idea?')
    expect(stripVoyagerAside('@Voyager, remind me')).toBe('remind me')
    expect(stripVoyagerAside('plain message')).toBe('plain message')
    expect(isVoyagerAside('@voyager hi')).toBe(true)
    expect(isVoyagerAside('email @voyager later')).toBe(false)
  })

  it('settles an aside once its STRIPPED event lands (the wedge bug)', () => {
    const settled = event('settled', '2026-07-10T10:14:00.000Z', {
      role: 'user',
      content: 'what is the almond tree idea?',
    })
    // before the event lands: show optimistic
    expect(shouldShowOptimisticUser('@voyager what is the almond tree idea?', [])).toBe(true)
    // after: the stripped twin releases it
    expect(shouldShowOptimisticUser('@voyager what is the almond tree idea?', [settled])).toBe(false)
  })

  it('still settles plain messages by exact content', () => {
    const settled = event('settled', '2026-07-10T10:14:00.000Z', { role: 'user', content: 'hello there' })
    expect(shouldShowOptimisticUser('hello there', [settled])).toBe(false)
    expect(shouldShowOptimisticUser('hello there', [])).toBe(true)
  })

  it('never shows the hidden welcome optimistically', () => {
    expect(shouldShowOptimisticUser('good morning in fambam', [])).toBe(false)
  })
})
