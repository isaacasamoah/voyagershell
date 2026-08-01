import { z } from 'zod'
import relationContract from './relation-conflict-contract.json'

export const RELATION_CONTRACT_VERSION = relationContract.version
export const RELATION_CANDIDATE_LIMIT = relationContract.blocking.candidateLimit
export const RELATION_STAGE1_PROMPT = relationContract.stage1Instruction
export const RELATION_STAGE2_PROMPT = relationContract.stage2Instruction

export const relationStage1Schema = z
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
      .max(RELATION_CANDIDATE_LIMIT),
  })
  .strict()

export const relationStage2Schema = z
  .object({
    relations: z
      .array(
        z
          .object({
            candidateUnitId: z.string().uuid(),
            verdict: z.enum(['contradicts', 'supersedes']),
            sourceUnitId: z.string().uuid(),
            targetUnitId: z.string().uuid(),
          })
          .strict(),
      )
      .max(RELATION_CANDIDATE_LIMIT),
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
