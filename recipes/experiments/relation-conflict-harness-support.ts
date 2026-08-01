import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { getOpenAI } from '../../lib/agents/cartographer/embeddings'
import relationContract from '../../lib/agents/cartographer/relation-conflict-contract.json'
import { CODEX_MODEL, createCodexModel } from '../../lib/models/codex'
import type { ModelRequirements } from '../../lib/models/router'
import corpusDocument from './relation-conflict-corpus.json'

export type Verdict = 'contradicts' | 'supersedes'
export type ExpectedVerdict = Verdict | 'none'
export type ConflictVerdict = 'conflict' | 'none'
export interface CorpusUnit {
  unitId: string
  claim: string
  topicLabels: string[]
}
export interface CorpusCandidate extends CorpusUnit {
  shape: string
  expected: ExpectedVerdict
}
export interface CorpusCase {
  subject: string
  focus: CorpusUnit
  candidates: CorpusCandidate[]
}
export interface PromptCandidate {
  unitId: string
  claim: string
  topicLabels: string[]
  similarity: number
}
interface CodexAuthDocument {
  tokens?: {
    access_token?: string
    account_id?: string
  }
}

export const corpus = corpusDocument as { cases: CorpusCase[] }
export const judgmentModelName = CODEX_MODEL
export const modelRequirements: ModelRequirements = {
  task: 'classification',
  quality: 'balanced',
}
export const requiredShapes = new Set([
  'restatement_not_contradiction',
  'temporal_supersession',
  'cross_topic_conflict',
  'negation',
  'adjacent_compatible',
])
export const stage1Schema = z
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
      .max(relationContract.blocking.candidateLimit),
  })
  .strict()
export const stage2Schema = z
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
      .max(relationContract.blocking.candidateLimit),
  })
  .strict()
  .superRefine((value, context) => {
    const candidateIds = value.relations.map(
      (relation) => relation.candidateUnitId,
    )
    if (new Set(candidateIds).size !== candidateIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'relation_candidates_must_be_unique',
        path: ['relations'],
      })
    }
  })

const normalizeTopic = (label: string): string =>
  label.toLowerCase().replace(/\s+/g, ' ').trim()

export const cosine = (left: number[], right: number[]): number => {
  const dot = left.reduce((sum, value, index) => sum + value * right[index], 0)
  const leftNorm = Math.sqrt(
    left.reduce((sum, value) => sum + value * value, 0),
  )
  const rightNorm = Math.sqrt(
    right.reduce((sum, value) => sum + value * value, 0),
  )
  return dot / (leftNorm * rightNorm)
}

export const embed = async (inputs: string[]): Promise<number[][]> => {
  const response = await getOpenAI().embeddings.create({
    model: relationContract.blocking.embeddingModel,
    input: inputs,
    dimensions: relationContract.blocking.embeddingDimensions,
  })
  return response.data.map((item) => item.embedding)
}

export const hasSharedTopic = (left: string[], right: string[]): boolean => {
  const normalized = new Set(left.map(normalizeTopic))
  return right.some((label) => normalized.has(normalizeTopic(label)))
}

export const promptFor = (
  focus: CorpusUnit,
  candidates: PromptCandidate[],
): string =>
  `## Focus KnowledgeUnit\n${JSON.stringify(focus)}\n\n` +
  '## Ordered authorized candidate KnowledgeUnits, nearest first\n' +
  `${JSON.stringify(candidates)}\n\nReturn the structured decisions.`

export const assertExactCoverage = (
  expectedIds: string[],
  actualIds: string[],
  stage: string,
): void => {
  if (
    new Set(actualIds).size !== actualIds.length ||
    expectedIds.length !== actualIds.length ||
    expectedIds.some((id) => !actualIds.includes(id))
  ) {
    throw new Error(`relation_conflict_output_incomplete:${stage}`)
  }
}

export const score = (counts: {
  tp: number
  fp: number
  fn: number
}): {
  precision: number
  recall: number
} => ({
  precision:
    counts.tp + counts.fp === 0 ? 0 : counts.tp / (counts.tp + counts.fp),
  recall: counts.tp + counts.fn === 0 ? 0 : counts.tp / (counts.tp + counts.fn),
})

export const getJudgmentModel = (): ReturnType<typeof createCodexModel> => {
  const authPath =
    process.env.K4C_CODEX_AUTH_PATH ?? join(homedir(), '.codex', 'auth.json')
  const document = JSON.parse(
    readFileSync(authPath, 'utf8'),
  ) as CodexAuthDocument
  const accessToken = document.tokens?.access_token
  const accountId = document.tokens?.account_id
  if (!accessToken || !accountId) throw new Error('codex_auth_unavailable')
  return createCodexModel({ accessToken, accountId })
}
