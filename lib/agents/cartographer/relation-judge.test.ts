import type { LanguageModel } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ generateObject: vi.fn() }))
vi.mock('ai', () => ({ generateObject: mocks.generateObject }))

import { judgeRelationConflicts } from './relation-judge'
import {
  RELATION_CANDIDATE_LIMIT,
  RELATION_STAGE1_PROMPT,
  RELATION_STAGE2_PROMPT,
  RELATION_VERDICTS,
  relationMaxOutputTokens,
} from './relation-contract'
import type { RelationAttempt } from './types'

const attempt: RelationAttempt = {
  attemptId: '74000000-0000-4000-8000-000000000001',
  leaseToken: '74000000-0000-4000-8000-000000000002',
  unitId: '74000000-0000-4000-8000-000000000003',
  personId: '74000000-0000-4000-8000-000000000004',
  contractVersion: 'relation-conflict-v2',
  candidateLimit: RELATION_CANDIDATE_LIMIT,
  stage1Instruction: RELATION_STAGE1_PROMPT,
  stage2Instruction: RELATION_STAGE2_PROMPT,
  verdicts: RELATION_VERDICTS,
  focusClaim: 'The physio said no running for eight weeks.',
  candidates: [
    {
      unitId: '74000000-0000-4000-8000-000000000005',
      claim: 'A new training log was filed.',
      topicLabels: ['marathon training'],
      similarity: 0.47,
    },
  ],
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

  it('accepts and budgets a maximal sixteen-conflict stage-two result', async () => {
    const candidates = Array.from({ length: RELATION_CANDIDATE_LIMIT }, (_, index) => ({
      unitId: `74000000-0000-4000-8000-${String(index + 5).padStart(12, '0')}`,
      claim: `Candidate conflict ${index + 1}`,
      topicLabels: ['maximal conflict window'],
      similarity: 0.9 - index / 100,
    }))
    const maximalAttempt = { ...attempt, candidates }
    const decisions = candidates.map(({ unitId }) => ({
      candidateUnitId: unitId,
      conflict: 'conflict' as const,
    }))
    const relations = candidates.map(({ unitId }) => ({
      candidateUnitId: unitId,
      verdict: 'contradicts' as const,
      sourceUnitId: attempt.unitId,
      targetUnitId: unitId,
    }))
    mocks.generateObject
      .mockResolvedValueOnce({
        object: { decisions },
        usage: { inputTokens: 100, outputTokens: 200 },
      })
      .mockResolvedValueOnce({
        object: { relations },
        usage: { inputTokens: 120, outputTokens: 1120 },
      })

    const result = await judgeRelationConflicts({} as LanguageModel, maximalAttempt)

    expect(result.kind).toBe('structured')
    if (result.kind !== 'structured') throw new Error('expected_structured_result')
    expect(result.relations).toHaveLength(RELATION_CANDIDATE_LIMIT)
    expect(mocks.generateObject).toHaveBeenCalledTimes(2)
    expect(mocks.generateObject.mock.calls[1][0].maxOutputTokens).toBe(
      relationMaxOutputTokens(RELATION_CANDIDATE_LIMIT),
    )
    expect(mocks.generateObject.mock.calls[1][0].schema.safeParse({ relations }).success)
      .toBe(true)
  })
})
