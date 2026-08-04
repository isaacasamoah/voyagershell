import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  embedding: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ rpc: mocks.rpc }),
}))
vi.mock('./search-embedding', () => ({
  generateSearchEmbedding: mocks.embedding,
  toVectorString: (embedding: number[]) => `[${embedding.join(',')}]`,
}))

import { keywordUnitSearch, semanticUnitSearch } from './unit-search'

const baseRow = {
  unit_id: '71000000-0000-4000-8000-000000000001',
  claim: 'The launch moved to Tuesday.',
  source_event_id: '71000000-0000-4000-8000-000000000002',
  source_content: 'The launch moved to Tuesday.',
  source_created_at: '2026-08-02T00:00:00Z',
  knowledge_type: 'operational',
  viewer_retired: true,
  effective_attention: 0,
}

describe('knowledge-unit search mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.embedding.mockResolvedValue([0.1, 0.2])
  })

  it('carries viewer retirement from a semantic row', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ ...baseRow, similarity: 0.91 }],
      error: null,
    })

    const result = await semanticUnitSearch('person-1', 'launch')

    expect(result.outcome).toBe('success')
    expect(result.hits[0]).toMatchObject({ retired: true, score: 0.91 })
  })

  it('carries viewer retirement from a keyword row', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ ...baseRow, rank_score: 0.73 }],
      error: null,
    })

    const result = await keywordUnitSearch('person-1', 'launch')

    expect(result.outcome).toBe('success')
    expect(result.hits[0]).toMatchObject({ retired: true, score: 0.73 })
  })
})
