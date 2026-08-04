import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  semanticUnitSearch: vi.fn(),
}))

vi.mock('@/lib/knowledge/unit-search', () => ({
  semanticUnitSearch: mocks.semanticUnitSearch,
}))

import { retrieveForContinuity } from './continuity'

const hit = {
  unitId: '71000000-0000-4000-8000-000000000001',
  claim: 'The launch moved to Tuesday.',
  sourceEventId: '71000000-0000-4000-8000-000000000002',
  sourceContent: 'The launch moved to Tuesday.',
  sourceCreatedAt: '2026-08-02T00:00:00Z',
  knowledgeType: 'operational',
  retired: false,
  effectiveAttention: 0.8,
  score: 0.91,
}

describe('conversation continuity knowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('injects a live claim without carrying a retired match from the same query', async () => {
    mocks.semanticUnitSearch.mockResolvedValue({
      outcome: 'success',
      hits: [
        { ...hit, retired: true },
        {
          ...hit,
          unitId: '71000000-0000-4000-8000-000000000003',
          sourceEventId: '71000000-0000-4000-8000-000000000004',
          claim: 'The launch moved to Wednesday.',
        },
      ],
    })

    const context = await retrieveForContinuity(
      [{ type: 'cross-session', trigger: 'Remember when', confidence: 0.9 }],
      'Remember when we discussed the launch?',
      [],
      { userId: 'person-1', conversationId: 'session-1' },
    )

    expect(context).toBe(
      '[From previous conversations]:\n- The launch moved to Wednesday.',
    )
    expect(context).not.toContain('The launch moved to Tuesday.')
    expect(mocks.semanticUnitSearch).toHaveBeenCalledWith(
      'person-1',
      'Remember when we discussed the launch?',
      { threshold: 0.6, limit: 3 },
    )
  })
})
