import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeGraphClaim } from '@/lib/knowledge/kernel/boundary'
import type { KnowledgeNode } from '@/lib/knowledge'

const mocks = vi.hoisted(() => ({
  curatePromptWindow: vi.fn(),
  retrieveKnowledgeGraphClaims: vi.fn(),
  recordKnowledgeUnitCitations: vi.fn(),
  upsertPersonSessionIndex: vi.fn(),
}))

vi.mock('@/lib/knowledge', () => ({
  curatePromptWindow: mocks.curatePromptWindow,
}))
vi.mock('@/lib/knowledge/kernel/boundary', () => ({
  retrieveKnowledgeGraphClaims: mocks.retrieveKnowledgeGraphClaims,
}))
vi.mock('@/lib/knowledge/lifecycle/citations', () => ({
  recordKnowledgeUnitCitations: mocks.recordKnowledgeUnitCitations,
}))
vi.mock('@/lib/knowledge/lifecycle/session-index', () => ({
  upsertPersonSessionIndex: mocks.upsertPersonSessionIndex,
}))
vi.mock('@/lib/voyage/context', () => ({
  loadVoyageContext: vi.fn(),
  formatVoyageContextSection: vi.fn(),
}))

import { composeSystemPrompt } from './index'

const PERSON_ID = '71000000-0000-4000-8000-000000000001'
const SESSION_ID = '71000000-0000-4000-8000-000000000002'
const PROJECTED_EVENT_ID = '71000000-0000-4000-8000-000000000003'
const PROJECTED_UNIT_ID = '71000000-0000-4000-8000-000000000004'
const NEW_EVENT_ID = '71000000-0000-4000-8000-000000000005'
const NEW_UNIT_ID = '71000000-0000-4000-8000-000000000006'

const projectedPreference: KnowledgeNode = {
  eventId: PROJECTED_EVENT_ID,
  content: 'Keep projected reports concise.',
  classifications: [],
  entities: [],
  topics: [],
  createdAt: new Date('2026-08-02T00:00:00Z'),
  knowledgeType: 'preference',
  attentionScore: 0.9,
  contextSnippet: 'Keep projected reports concise.',
}

const graphPreference = (
  knowledgeUnitId: string,
  sourceEventId: string,
  claim: string,
): KnowledgeGraphClaim => ({
  knowledgeUnitId,
  sourceEventId,
  claim,
  sourceContent: claim,
  knowledgeType: 'preference',
  attentionScore: 0.9,
})

describe('standing graph-memory citations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.curatePromptWindow.mockResolvedValue({
      preferences: [projectedPreference],
      operational: [],
      domainHeadlines: [],
      totalTokens: 10,
      evictedCount: 0,
    })
    mocks.upsertPersonSessionIndex.mockResolvedValue(true)
    mocks.retrieveKnowledgeGraphClaims.mockResolvedValue({
      outcome: 'success',
      claims: [
        graphPreference(
          PROJECTED_UNIT_ID,
          PROJECTED_EVENT_ID,
          'Duplicate projected preference.',
        ),
        graphPreference(
          NEW_UNIT_ID,
          NEW_EVENT_ID,
          'Keep newly reached reports humane.',
        ),
      ],
      truncated: false,
    })
    mocks.recordKnowledgeUnitCitations.mockResolvedValue({
      outcome: 'recorded',
      inserted: 1,
    })
  })

  it('indexes the session and records every unit-backed standing delivery', async () => {
    const composed = await composeSystemPrompt(PERSON_ID, {
      sessionId: SESSION_ID,
    })

    expect(mocks.upsertPersonSessionIndex).toHaveBeenCalledWith(
      PERSON_ID,
      SESSION_ID,
      0,
    )
    expect(mocks.upsertPersonSessionIndex.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.retrieveKnowledgeGraphClaims.mock.invocationCallOrder[0],
    )
    expect(mocks.recordKnowledgeUnitCitations).toHaveBeenCalledWith({
      personId: PERSON_ID,
      sessionId: SESSION_ID,
      channel: 'standing',
      knowledgeUnitIds: [PROJECTED_UNIT_ID, NEW_UNIT_ID],
    })
    expect(composed.staticPrompt).toContain('Keep projected reports concise.')
    expect(composed.staticPrompt).toContain('Keep newly reached reports humane.')
    expect(composed.workingMemoryUnitIds).toEqual([
      PROJECTED_UNIT_ID,
      NEW_UNIT_ID,
    ])
  })

  it('withholds a new standing claim when its citation cannot be recorded', async () => {
    mocks.recordKnowledgeUnitCitations.mockResolvedValue({
      outcome: 'failed',
      inserted: 0,
    })

    const composed = await composeSystemPrompt(PERSON_ID, {
      sessionId: SESSION_ID,
    })

    expect(composed.staticPrompt).not.toContain('Keep newly reached reports humane.')
    expect(composed.staticPrompt).not.toContain('Keep projected reports concise.')
    expect(composed.workingMemoryUnitIds).toEqual([])
    expect(composed.dynamicPrompt).toContain(
      'standing graph memory was withheld because its delivery could not be recorded',
    )
  })

  it('does not reach graph memory without a durable session index', async () => {
    mocks.upsertPersonSessionIndex.mockResolvedValue(false)

    const composed = await composeSystemPrompt(PERSON_ID, {
      sessionId: SESSION_ID,
    })

    expect(mocks.retrieveKnowledgeGraphClaims).not.toHaveBeenCalled()
    expect(mocks.recordKnowledgeUnitCitations).toHaveBeenCalledWith(
      expect.objectContaining({ knowledgeUnitIds: [] }),
    )
    expect(composed.workingMemoryUnitIds).toEqual([])
    expect(composed.dynamicPrompt).toContain('Graph memory reach was cut short')
  })
})
