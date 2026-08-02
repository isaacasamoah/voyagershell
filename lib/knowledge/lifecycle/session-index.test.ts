import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  memory: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ rpc: mocks.rpc }),
}))
vi.mock('@/lib/debug/logger', () => ({
  log: { memory: mocks.memory },
}))

import { upsertPersonSessionIndex } from './session-index'

describe('per-person session indexing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('delegates atomic monotonic upsert to the database function', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })

    await expect(upsertPersonSessionIndex(
      '71000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000002',
      1,
    )).resolves.toBe(true)
    expect(mocks.rpc).toHaveBeenCalledWith('upsert_person_session_index', {
      p_person_id: '71000000-0000-4000-8000-000000000001',
      p_session_id: '71000000-0000-4000-8000-000000000002',
      p_event_count: 1,
    })
  })

  it('reports failure without inventing a local session row', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'database unavailable' },
    })

    await expect(upsertPersonSessionIndex('person', 'session', 0)).resolves.toBe(false)
    expect(mocks.memory).toHaveBeenCalledWith(
      'Person session index failed',
      expect.objectContaining({ personId: 'person', sessionId: 'session' }),
      'warn',
    )
  })
})
