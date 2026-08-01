import type { LanguageModel } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ generateObject: vi.fn() }))
vi.mock('ai', () => ({ generateObject: mocks.generateObject }))

import { judgeRelationConflicts } from './relation-judge'
import type { RelationAttempt } from './types'

const attempt: RelationAttempt = {
  attemptId: '74000000-0000-4000-8000-000000000001',
  leaseToken: '74000000-0000-4000-8000-000000000002',
  unitId: '74000000-0000-4000-8000-000000000003',
  personId: '74000000-0000-4000-8000-000000000004',
  contractVersion: 'relation-conflict-v2',
  focusClaim: 'The physio said no running for eight weeks.',
  candidates: [
    {
      unitId: '74000000-0000-4000-8000-000000000005',
      claim: 'A new training log was filed.',
      topicLabels: ['marathon training'],
      similarity: 0.47,
    },
  ],
  attemptNumber: 1,
}

describe('relation conflict judge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stops after stage one for compatible co-filed units and preserves usage', async () => {
    mocks.generateObject.mockResolvedValue({
      object: {
        decisions: [
          {
            candidateUnitId: attempt.candidates[0].unitId,
            conflict: 'none',
          },
        ],
      },
      usage: { inputTokens: 20, outputTokens: 5 },
    })

    const result = await judgeRelationConflicts({} as LanguageModel, attempt)

    expect(mocks.generateObject).toHaveBeenCalledOnce()
    expect(result).toEqual({
      kind: 'structured',
      rawOutput: {
        stage1: {
          decisions: [
            {
              candidateUnitId: attempt.candidates[0].unitId,
              conflict: 'none',
            },
          ],
        },
        stage2: { relations: [] },
        relations: [],
      },
      relations: [],
      inputTokens: 20,
      outputTokens: 5,
    })
  })
})
