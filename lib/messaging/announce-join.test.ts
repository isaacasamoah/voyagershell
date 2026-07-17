import { beforeEach, describe, expect, it, vi } from 'vitest'

// Proves the accepted-join notification rides the realtime lane correctly:
// it emits ONE 'join'-sourced event addressed to the other active members
// (never the joiner) and fans out deliveries to exactly them.

const createMessageEvent = vi.fn(async (..._args: unknown[]) => 'event-1')
const fanOutDeliveries = vi.fn(async (..._args: unknown[]) => undefined)

let activeMembers: Array<{ user_id: string | null }> = []
const joinerProfile = { display_name: 'vanessa' }

class FakeQuery {
  select() { return this }
  eq() { return this }
  // profiles lookup ends in maybeSingle
  maybeSingle() { return Promise.resolve({ data: joinerProfile, error: null }) }
  // space_members active lookup is awaited directly
  then<T>(onfulfilled: (v: { data: unknown; error: null }) => T) {
    return Promise.resolve({ data: activeMembers, error: null }).then(onfulfilled)
  }
}

const fakeAdmin = { from: () => new FakeQuery() }

const loadModule = async () => {
  vi.resetModules()
  vi.doMock('@/lib/supabase/admin', () => ({ getAdminClient: () => fakeAdmin }))
  vi.doMock('@/lib/debug', () => ({ log: { api: vi.fn() } }))
  vi.doMock('@/lib/voyage', () => ({ resolveSessionVoyage: vi.fn(async () => 'fambam') }))
  vi.doMock('@/lib/knowledge/events', () => ({ createMessageEvent }))
  vi.doMock('@/lib/messaging/deliveries', () => ({ fanOutDeliveries }))
  return await import('./invites')
}

describe('announceJoin — realtime accepted notification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activeMembers = []
  })

  it('emits a join line to the other active members and fans out to exactly them', async () => {
    activeMembers = [{ user_id: 'isaac' }, { user_id: 'vanessa' }, { user_id: 'tom' }]
    const { announceJoin } = await loadModule()

    await announceJoin('conv-1', 'space-1', 'vanessa')

    expect(createMessageEvent).toHaveBeenCalledTimes(1)
    const [conversationId, role, content, options] = createMessageEvent.mock.calls[0]
    expect(conversationId).toBe('conv-1')
    expect(role).toBe('user')
    expect(content).toBe('vanessa joined the room')
    expect(options).toMatchObject({
      source: 'join',
      participants: ['isaac', 'tom'], // joiner excluded
      addressedTo: ['isaac', 'tom'],
      senderUserId: 'vanessa',
      voyageSlug: 'fambam',
    })
    expect(fanOutDeliveries).toHaveBeenCalledWith('event-1', ['isaac', 'tom'])
  })

  it('stays silent when the joiner is the only active member (no one to notify)', async () => {
    activeMembers = [{ user_id: 'vanessa' }]
    const { announceJoin } = await loadModule()

    await announceJoin('conv-1', 'space-1', 'vanessa')

    expect(createMessageEvent).not.toHaveBeenCalled()
    expect(fanOutDeliveries).not.toHaveBeenCalled()
  })
})
