import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }))
vi.mock('@/lib/voyage', () => ({
  SessionAccessError: class SessionAccessError extends Error {},
  resolveSessionVoyage: vi.fn(),
}))

import {
  isInFeedContext,
  toFeedEvents,
  type FeedEventRow,
} from './feed'

const voyagerMessage = (voyageSlug: string | null): FeedEventRow => ({
  id: `voyager-${voyageSlug ?? 'personal'}`,
  event_type: 'message',
  content: 'The background research is ready.',
  created_at: '2026-07-10T02:00:00.000Z',
  metadata: {
    sender_display_name: 'Voyager',
    addressed_to: ['user-1'],
  },
  source_ref: {
    conversation_id: 'originating-conversation',
    role: 'assistant',
  },
  actor_type: 'voyager',
  user_id: 'user-1',
  participants: ['user-1'],
  voyage_slug: voyageSlug,
})

describe('delivered Voyager messages in the event feed', () => {
  it('includes a participant-scoped Voyager message in its voyage feed', () => {
    const row = voyagerMessage('launch')

    expect(isInFeedContext(row, 'user-1', 'current-conversation', 'launch')).toBe(true)
    expect(isInFeedContext(row, 'user-1', 'current-conversation', 'other-voyage')).toBe(false)
    expect(toFeedEvents([row], [], 'user-1')[0]).toMatchObject({
      eventType: 'message',
      role: 'assistant',
      senderDisplayName: 'Voyager',
      content: 'The background research is ready.',
    })
  })

  it('includes the same participant-scoped message in personal space when voyage is null', () => {
    const row = voyagerMessage(null)

    expect(isInFeedContext(row, 'user-1', 'another-conversation', null)).toBe(true)
    expect(isInFeedContext(row, 'other-user', 'another-conversation', null)).toBe(false)
    expect(toFeedEvents([row], [], 'user-1')[0]).toMatchObject({
      eventType: 'message',
      role: 'assistant',
      senderDisplayName: 'Voyager',
    })
  })
})

// ── cut ④ — attributed render (WREN ✦) + owner-authored seen ─────────────────
const fannedWrenReply = (viewerIsOwner: boolean): FeedEventRow => ({
  id: 'evt-wren-public',
  event_type: 'message',
  content: 'You both landed on the same tradeoff.',
  created_at: '2026-07-18T09:00:00.000Z',
  metadata: {
    session_id: 'conv-fambam',
    source: 'room',
    sender_display_name: 'Wren',
    sender_user_id: 'user-isaac',
    owner_display_name: 'Isaac',
  },
  source_ref: { conversation_id: 'conv-fambam', role: 'assistant' },
  actor_type: 'voyager',
  user_id: 'user-isaac', // the OWNER is the identity of record
  participants: ['user-isaac', 'user-elisheya'],
  voyage_slug: null,
})

describe('cut ④ — a fanned voyager reply renders WREN ✦ (Isaac’s Voyager)', () => {
  it('carries the voyager name + owner name for the attributed badge', () => {
    const [event] = toFeedEvents([fannedWrenReply(false)], [], 'user-elisheya')
    expect(event.role).toBe('assistant')
    expect(event.senderDisplayName).toBe('Wren') // NOT the flat "Voyager"
    expect(event.ownerName).toBe('Isaac')
  })

  it('the OWNER’s own public reply is inherently seen (no delivery, no unread badge)', () => {
    // The owner is excluded from the fan-out, so there is no delivery row — the
    // message must still count as seen for them.
    const [event] = toFeedEvents([fannedWrenReply(true)], [], 'user-isaac')
    expect(event.seen).toBe(true)
    expect(event.deliveryId).toBeNull()
  })

  it('keeps historical public attribution immutable after the owner renames', () => {
    const [event] = toFeedEvents(
      [fannedWrenReply(true)],
      [],
      'user-isaac',
      null,
      {
        currentVoyagerDisplayName: 'Sol',
        sharedSourceEventIds: new Set(),
      },
    )
    expect(event.senderDisplayName).toBe('Wren')
    expect(event.shared).toBe(false)
  })
})

describe('private assistant feed enrichment', () => {
  const privateReply: FeedEventRow = {
    id: 'private-reply-1',
    event_type: 'conversation',
    content: 'A private answer.',
    created_at: '2026-07-22T00:00:00.000Z',
    metadata: { session_id: 'conversation-1' },
    source_ref: { conversation_id: 'conversation-1', role: 'assistant' },
    actor_type: 'voyager',
    user_id: 'user-isaac',
    participants: ['user-isaac'],
    voyage_slug: null,
  }

  it('uses the current companion display and current-room share mapping', () => {
    const [event] = toFeedEvents(
      [privateReply],
      [],
      'user-isaac',
      null,
      {
        currentVoyagerDisplayName: 'Sol',
        sharedSourceEventIds: new Set(['private-reply-1']),
      },
    )

    expect(event).toMatchObject({
      role: 'assistant',
      senderDisplayName: 'Sol',
      shared: true,
      ownerName: null,
    })
  })

  it('falls back to the VOYAGER brand when the current handle is only derived', () => {
    const [event] = toFeedEvents(
      [privateReply],
      [],
      'user-isaac',
      null,
      {
        currentVoyagerDisplayName: null,
        sharedSourceEventIds: new Set(),
      },
    )
    expect(event.senderDisplayName).toBeNull()
    expect(event.shared).toBe(false)
  })
})
