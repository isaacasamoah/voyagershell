import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))
vi.mock('ai', () => ({ tool: (definition: unknown) => definition }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ rpc: rpcMock }),
}))

import { createVoyagerMessageQueryTools } from './voyager-message-query-tools'

type MessageTool = {
  inputSchema: { safeParse: (input: unknown) => { success: boolean } }
  execute: (input: { since?: string }) => Promise<string>
}

const getMessages = (voyageSlug = 'fambam'): MessageTool =>
  createVoyagerMessageQueryTools({
    userId: '10000000-0000-4000-8000-000000000001',
    voyageSlug,
  }).get_messages as unknown as MessageTool

describe('get_messages installed retrieval boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rpcMock.mockResolvedValue({
      data: [{
        event_id: '30000000-0000-4000-8000-000000000001',
        content: 'The fix is ready.',
        source_created_at: '2026-07-23T00:00:00.000Z',
        sender_display_name: 'Tom',
        sender_user_id: '10000000-0000-4000-8000-000000000002',
      }],
      error: null,
    })
  })

  it('rejects unsupported channel vocabulary', () => {
    const schema = getMessages().inputSchema
    expect(schema.safeParse({ since: '2026-07-22T00:00:00.000Z' }).success).toBe(true)
    expect(schema.safeParse({ channel: 'general' }).success).toBe(false)
  })

  it('uses the service RPC with mandatory caller and voyage identity', async () => {
    const result = await getMessages().execute({ since: '2026-07-22T00:00:00.000Z' })
    expect(rpcMock).toHaveBeenCalledWith('get_voyage_messages', {
      p_user_id: '10000000-0000-4000-8000-000000000001',
      p_voyage_slug: 'fambam',
      p_since: '2026-07-22T00:00:00.000Z',
      p_max_count: 20,
    })
    expect(result).toContain('Tom')
    expect(result).toContain('The fix is ready.')
  })

  it('fails closed outside a voyage and on RPC error', async () => {
    await expect(getMessages('').execute({})).resolves.toContain('switch to a voyage')
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'denied' } })
    await expect(getMessages().execute({})).resolves.toBe('Error checking messages.')
  })
})
