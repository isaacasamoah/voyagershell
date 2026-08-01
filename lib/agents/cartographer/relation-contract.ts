import { z } from 'zod'
import relationContract from './relation-conflict-contract.json'
import type { RelationCandidate, RelationVerdict } from './types'

export const RELATION_CONTRACT_VERSION = relationContract.version
export const RELATION_CANDIDATE_LIMIT = relationContract.blocking.candidateLimit
export const RELATION_STAGE1_PROMPT = relationContract.stage1Instruction
export const RELATION_STAGE2_PROMPT = relationContract.stage2Instruction
export const RELATION_VERDICTS = relationContract.verdicts as RelationVerdict[]

export const createRelationStage1Schema = (candidateLimit: number) => z
  .object({
    decisions: z
      .array(
        z
          .object({
            candidateUnitId: z.string().uuid(),
            conflict: z.enum(['conflict', 'none']),
          })
          .strict(),
      )
      .max(candidateLimit),
  })
  .strict()

export const createRelationStage2Schema = (
  candidateLimit: number,
  verdicts: readonly RelationVerdict[],
) => z
  .object({
    relations: z
      .array(
        z
          .object({
            candidateUnitId: z.string().uuid(),
            verdict: z.custom<RelationVerdict>((value) => (
              typeof value === 'string' && verdicts.includes(value as RelationVerdict)
            )),
            sourceUnitId: z.string().uuid(),
            targetUnitId: z.string().uuid(),
          })
          .strict(),
      )
      .max(candidateLimit),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.relations.map(({ candidateUnitId }) => candidateUnitId)
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'relation_candidates_must_be_unique',
        path: ['relations'],
      })
    }
  })

export const buildRelationPrompt = (
  focus: { unitId: string; claim: string },
  candidates: RelationCandidate[],
  candidateLimit: number,
): string => `## Focus KnowledgeUnit
${JSON.stringify(focus)}

## Ordered authorized candidate KnowledgeUnits, nearest first
${JSON.stringify(candidates.slice(0, candidateLimit))}

Return the structured decisions.`

const RELATION_OUTPUT_TOKEN_ENVELOPE = 512
const RELATION_OUTPUT_TOKENS_PER_CANDIDATE = 96

export const relationMaxOutputTokens = (candidateLimit: number): number => (
  RELATION_OUTPUT_TOKEN_ENVELOPE
  + candidateLimit * RELATION_OUTPUT_TOKENS_PER_CANDIDATE
)
