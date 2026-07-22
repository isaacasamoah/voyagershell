import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ rpc: mocks.rpc }),
}))

import { writeKnowledgeGraphEdge } from './graph-edge-writer'

describe('writeKnowledgeGraphEdge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ error: null })
  })

  it('writes final graph references through the service-only RPC', async () => {
    await writeKnowledgeGraphEdge({
      source: { kind: 'knowledge_unit', authorityId: '71000000-0000-4000-8000-000000000001' },
      target: { kind: 'knowledge_unit', authorityId: '71000000-0000-4000-8000-000000000002' },
      kind: 'supports',
    })

    expect(mocks.rpc).toHaveBeenCalledWith('write_knowledge_graph_edge', {
      p_source_kind: 'knowledge_unit',
      p_source_authority_id: '71000000-0000-4000-8000-000000000001',
      p_target_kind: 'knowledge_unit',
      p_target_authority_id: '71000000-0000-4000-8000-000000000002',
      p_kind: 'supports',
    })
  })

  it('surfaces database failures to the caller', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'target_not_found' } })

    await expect(writeKnowledgeGraphEdge({
      source: { kind: 'person', authorityId: '10000000-0000-4000-8000-000000000001' },
      target: { kind: 'voyage', authorityId: '41000000-0000-4000-8000-000000000001' },
      kind: 'member_of',
    })).rejects.toThrow('knowledge_graph_edge_write_failed:target_not_found')
  })
})
