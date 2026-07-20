import { describe, expect, it } from 'vitest'
import {
  fromFeedApiEvent,
  mergeFeedEvent,
  shouldShowStreamingReply,
  sortFeedEvents,
  toFeedApiEvent,
  type FeedEvent,
  isHydratedMessage,
} from './feed-types'

const event = (id: string, createdAt: string, patch: Partial<FeedEvent> = {}): FeedEvent => ({
  id,
  eventType: 'conversation',
  role: 'assistant',
  kind: 'message',
  inviteState: null,
  senderDisplayName: 'Voyager',
  ownerName: null,
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

  it('round-trips invite kind + invite state through the API shape', () => {
    const knock = event('knock', '2026-07-16T02:22:00.000Z', {
      eventType: 'message',
      role: 'human',
      kind: 'invite',
      inviteState: 'invited',
      senderDisplayName: 'isaac',
    })

    const restored = fromFeedApiEvent(toFeedApiEvent(knock))
    expect(restored.kind).toBe('invite')
    expect(restored.inviteState).toBe('invited')
    // A plain message defaults cleanly and never carries an invite state.
    const plain = fromFeedApiEvent(toFeedApiEvent(event('m', '2026-07-16T02:23:00.000Z')))
    expect(plain.kind).toBe('message')
    expect(plain.inviteState).toBeNull()
  })

  it('inserts live events at their createdAt position', () => {
    const current = [
      event('first', '2026-07-09T10:01:00.000Z'),
      event('third', '2026-07-09T10:03:00.000Z'),
    ]
    const next = mergeFeedEvent(current, event('second', '2026-07-09T10:02:00.000Z'))

    expect(next.map((item) => item.id)).toEqual(['first', 'second', 'third'])
  })

  it('shows the streaming reply until this turn\'s persisted event lands (count-based)', () => {
    // One assistant event already in the feed when the reply starts streaming.
    const olderEvent = event('older', '2026-07-09T10:01:00.000Z')
    const reply = {
      id: 'streaming-assistant',
      content: 'final answer',
      startedAt: '2026-07-09T10:02:00.000Z',
      settledCount: 1,
    }
    const settledEvent = event('settled', '2026-07-09T10:03:00.000Z')

    expect(shouldShowStreamingReply(reply, [olderEvent])).toBe(true)            // still 1 → show
    expect(shouldShowStreamingReply(reply, [olderEvent, settledEvent])).toBe(false) // now 2 → dismiss
  })

  it('dismisses the transient even when stored content differs from the stream (the stuck-at-bottom bug)', () => {
    // The persisted reply is normalized differently from what streamed — the
    // old exact-content match would never fire and pin the transient forever.
    const reply = {
      id: 'streaming-assistant',
      content: 'The Sun is ~5,500°C at the surface',
      startedAt: '2026-07-09T10:02:00.000Z',
      settledCount: 0,
    }
    const persistedDifferently = event('settled', '2026-07-09T10:03:00.000Z', {
      content: 'The Sun’s temperature depends where you measure: **Surface** ~5,500 °C…',
    })

    // Count went 0 → 1: the turn settled, so the transient clears regardless of
    // content or clock skew.
    expect(shouldShowStreamingReply(reply, [persistedDifferently])).toBe(false)
  })
})

// F2 root-cause regression: the server persists `@voyager …` asides STRIPPED,
// so the optimistic settle must compare aside-stripped content on both sides —
// or the composer wedges into queue mode after every aside (2026-07-10, live).
import { shouldShowOptimisticUser, stripVoyagerAside } from './feed-types'

describe('aside-aware optimistic settle', () => {
  it('strips the @voyager prefix exactly like the route', () => {
    expect(stripVoyagerAside('@voyager what is the almond tree idea?')).toBe('what is the almond tree idea?')
    expect(stripVoyagerAside('@Voyager, remind me')).toBe('remind me')
    expect(stripVoyagerAside('plain message')).toBe('plain message')
  })

  it('strips a NAMED aside when the caller passes its own handle', () => {
    expect(stripVoyagerAside('@wren think with me', 'wren')).toBe('think with me')
    // …but without the handle a named aside is NOT stripped (only the alias is)
    expect(stripVoyagerAside('@wren think with me')).toBe('@wren think with me')
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

  it('settles a NAMED @wren aside against the caller own handle (F1 regression)', () => {
    // Server persists the aside STRIPPED; the client must strip with the same
    // own-handle or the optimistic twin never releases and the composer wedges.
    const settled = event('settled', '2026-07-10T10:15:00.000Z', {
      role: 'user',
      content: 'think with me',
    })
    expect(shouldShowOptimisticUser('@wren think with me', [], 'wren')).toBe(true)
    expect(shouldShowOptimisticUser('@wren think with me', [settled], 'wren')).toBe(false)
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

// Optimistic-lane honesty (2026-07-20): hydrated stream messages can carry
// OTHER people's words under role 'user' — they must never render as "YOU".
describe('isHydratedMessage', () => {
  it('is true only for messages tagged by stream hydration', () => {
    expect(isHydratedMessage({ metadata: { hydrated: true } })).toBe(true)
    expect(isHydratedMessage({ metadata: {} })).toBe(false)
    expect(isHydratedMessage({})).toBe(false)
    expect(isHydratedMessage({ metadata: null })).toBe(false)
  })
})
