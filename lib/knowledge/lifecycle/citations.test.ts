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

import { recordKnowledgeUnitCitations } from './citations'

const PERSON_ID = '71000000-0000-4000-8000-000000000001'
const SESSION_ID = '71000000-0000-4000-8000-000000000002'
const UNIT_ID = '71000000-0000-4000-8000-000000000003'

describe('knowledge-unit citation recording', () => {
  beforeEach(() => vi.clearAllMocks())

  it('records one deduplicated act per delivered unit and channel', async () => {
    mocks.rpc.mockResolvedValue({ data: 1, error: null })

    await expect(recordKnowledgeUnitCitations({
      personId: PERSON_ID,
      sessionId: SESSION_ID,
      channel: 'reach',
      knowledgeUnitIds: [UNIT_ID, UNIT_ID],
    })).resolves.toEqual({ outcome: 'recorded', inserted: 1 })
    expect(mocks.rpc).toHaveBeenCalledWith('record_knowledge_unit_citations', {
      p_person_id: PERSON_ID,
      p_session_id: SESSION_ID,
      p_channel: 'reach',
      p_unit_ids: [UNIT_ID],
    })
  })

  it('skips an empty delivery without touching persistence', async () => {
    await expect(recordKnowledgeUnitCitations({
      personId: PERSON_ID,
      sessionId: SESSION_ID,
      channel: 'standing',
      knowledgeUnitIds: [],
    })).resolves.toEqual({ outcome: 'skipped', inserted: 0 })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('fails closed on malformed identities or persistence failure', async () => {
    await expect(recordKnowledgeUnitCitations({
      personId: 'not-a-person-id',
      sessionId: SESSION_ID,
      channel: 'reach',
      knowledgeUnitIds: [UNIT_ID],
    })).resolves.toEqual({ outcome: 'failed', inserted: 0 })
    expect(mocks.rpc).not.toHaveBeenCalled()

    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'database unavailable' },
    })
    await expect(recordKnowledgeUnitCitations({
      personId: PERSON_ID,
      sessionId: SESSION_ID,
      channel: 'reach',
      knowledgeUnitIds: [UNIT_ID],
    })).resolves.toEqual({ outcome: 'failed', inserted: 0 })
    expect(mocks.memory).toHaveBeenCalledWith(
      'Knowledge-unit citation recording failed',
      expect.objectContaining({ unitCount: 1 }),
      'warn',
    )
  })
})
