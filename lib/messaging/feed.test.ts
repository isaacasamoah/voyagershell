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
