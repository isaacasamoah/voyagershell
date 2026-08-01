import { generateObject, type LanguageModel } from 'ai'
import type { Json } from '@/lib/supabase/types'
import {
  buildRelationPrompt,
  createRelationStage1Schema,
  createRelationStage2Schema,
  relationMaxOutputTokens,
} from './relation-contract'
import type {
  ExtractionFailureKind,
  RelationAttempt,
  RelationWrite,
} from './types'
import { classifyProviderFailure } from './provider-failure'

type RelationJudgment =
  | {
      kind: 'structured'
      rawOutput: Json
      relations: RelationWrite[]
      inputTokens: number | undefined
      outputTokens: number | undefined
    }
  | {
      kind: 'failed'
      failure: ExtractionFailureKind
      errorClass: string
    }

class RelationOutputIncompleteError extends Error {
  constructor(stage: string) {
    super(`knowledge_relation_output_incomplete:${stage}`)
    this.name = 'RelationOutputIncompleteError'
  }
}

const addUsage = (
  first: number | undefined,
  second: number | undefined,
): number | undefined =>
  first === undefined || second === undefined ? undefined : first + second

const assertExactCoverage = (
  expectedIds: string[],
  actualIds: string[],
  stage: string,
): void => {
  if (
    new Set(actualIds).size !== actualIds.length ||
    expectedIds.length !== actualIds.length ||
    expectedIds.some((id) => !actualIds.includes(id))
  ) {
    throw new RelationOutputIncompleteError(stage)
  }
}

const promptFor = (
  attempt: RelationAttempt,
  candidateIds?: Set<string>,
): string => {
  const candidates = candidateIds
    ? attempt.candidates.filter(({ unitId }) => candidateIds.has(unitId))
    : attempt.candidates
  return buildRelationPrompt(
    { unitId: attempt.unitId, claim: attempt.focusClaim },
    candidates,
    attempt.candidateLimit,
  )
}

export const judgeRelationConflicts = async (
  model: LanguageModel,
  attempt: RelationAttempt,
): Promise<RelationJudgment> => {
  if (attempt.candidates.length === 0) {
    return {
      kind: 'structured',
      rawOutput: {
        stage1: { decisions: [] },
        stage2: { relations: [] },
        relations: [],
      },
      relations: [],
      inputTokens: 0,
      outputTokens: 0,
    }
  }
  try {
    const stage1Schema = createRelationStage1Schema(attempt.candidateLimit)
    const stage2Schema = createRelationStage2Schema(
      attempt.candidateLimit,
      attempt.verdicts,
    )
    const maxOutputTokens = relationMaxOutputTokens(attempt.candidateLimit)
    const stage1 = await generateObject({
      model,
      system: attempt.stage1Instruction,
      messages: [{ role: 'user', content: promptFor(attempt) }],
      schema: stage1Schema,
      maxOutputTokens,
    })
    assertExactCoverage(
      attempt.candidates.map(({ unitId }) => unitId),
      stage1.object.decisions.map(({ candidateUnitId }) => candidateUnitId),
      'stage1',
    )
    const conflictIds = new Set(
      stage1.object.decisions
        .filter(({ conflict }) => conflict === 'conflict')
        .map(({ candidateUnitId }) => candidateUnitId),
    )
    const stage2 =
      conflictIds.size === 0
        ? null
        : await generateObject({
            model,
            system: attempt.stage2Instruction,
            messages: [
              { role: 'user', content: promptFor(attempt, conflictIds) },
            ],
            schema: stage2Schema,
            maxOutputTokens,
          })
    assertExactCoverage(
      Array.from(conflictIds),
      (stage2?.object.relations ?? []).map(
        ({ candidateUnitId }) => candidateUnitId,
      ),
      'stage2',
    )
    const relations = (stage2?.object.relations ?? [])
      .map((relation) => {
        if (
          relation.sourceUnitId !== attempt.unitId ||
          relation.targetUnitId !== relation.candidateUnitId
        ) {
          throw new RelationOutputIncompleteError('stage2_endpoints')
        }
        return { ...relation, kind: relation.verdict }
      })
      .map(({ verdict: _verdict, ...relation }) => relation)
    return {
      kind: 'structured',
      rawOutput: {
        stage1: stage1.object as unknown as Json,
        stage2: (stage2?.object ?? { relations: [] }) as unknown as Json,
        relations: relations as unknown as Json,
      },
      relations,
      inputTokens: stage2
        ? addUsage(stage1.usage.inputTokens, stage2.usage.inputTokens)
        : stage1.usage.inputTokens,
      outputTokens: stage2
        ? addUsage(stage1.usage.outputTokens, stage2.usage.outputTokens)
        : stage1.usage.outputTokens,
    }
  } catch (error) {
    return {
      kind: 'failed',
      failure: classifyProviderFailure(error, {
        malformedErrorNames: ['RelationOutputIncompleteError'],
      }),
      errorClass:
        error instanceof Error && error.name
          ? error.name.slice(0, 80)
          : 'unknown_relation_provider_error',
    }
  }
}
