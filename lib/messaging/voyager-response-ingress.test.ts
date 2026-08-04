import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const updateSessionActivity = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ rpc }),
}))
vi.mock('@/lib/knowledge/event-storage', () => ({ updateSessionActivity }))
vi.mock('@/lib/debug', () => ({
  log: { api: vi.fn() },
}))

describe('atomic message ingress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateSessionActivity.mockResolvedValue(undefined)
    rpc.mockResolvedValue({
      data: [{ event_id: 'assistant-event-1', status: 'created' }],
      error: null,
    })
  })

  it('claims a Voyager response against its source event and no delivery audience', async () => {
    const { claimVoyagerResponseIngress } = await import('./voyager-response-ingress')

    await expect(claimVoyagerResponseIngress({
      userId: 'user-1',
      sessionId: 'conversation-1',
      voyageSlug: 'launch',
      sourceEventId: 'source-event-1',
      content: 'A private answer.',
    })).resolves.toEqual({
      eventId: 'assistant-event-1',
      status: 'created',
      recipients: [],
    })

    expect(rpc).toHaveBeenCalledWith('claim_source_message_ingress', {
      p_actor_id: 'user-1',
      p_transport: 'agent',
      p_client_message_id: 'reply:source-event-1',
      p_space_id: null,
      p_voyage_slug: 'launch',
      p_content: 'A private answer.',
      p_event_type: 'conversation',
      p_source_type: 'conversation',
      p_actor_type: 'voyager',
      p_audience_member_ids: ['user-1'],
      p_recipient_ids: [],
      p_metadata: {
        classifications: [],
        entities: [],
        topics: [],
        session_id: 'conversation-1',
        reply_to_event_id: 'source-event-1',
      },
      p_source_ref: {
        conversation_id: 'conversation-1',
        role: 'assistant',
      },
    })
  })

  it('enriches only a newly created Voyager response', async () => {
    const { enrichVoyagerResponseIngress } = await import('./voyager-response-ingress')
    const input = {
      userId: 'user-1',
      sessionId: 'conversation-1',
      sourceEventId: 'source-event-1',
      content: 'A private answer.',
    }

    await enrichVoyagerResponseIngress(input, {
      eventId: 'assistant-event-1',
      status: 'created',
      recipients: [],
    })

    expect(updateSessionActivity).toHaveBeenCalledWith(
      'conversation-1',
      'user-1',
    )

    vi.clearAllMocks()
    await enrichVoyagerResponseIngress(input, {
      eventId: 'assistant-event-1',
      status: 'replayed',
      recipients: [],
    })
    expect(updateSessionActivity).not.toHaveBeenCalled()
  })
})
