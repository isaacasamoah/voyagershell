import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getOpenAI } from '../../lib/agents/cartographer/embeddings'
import relationContract from '../../lib/agents/cartographer/relation-conflict-contract.json'
import {
  buildRelationPrompt,
  createRelationStage1Schema,
  createRelationStage2Schema,
  RELATION_VERDICTS,
  relationMaxOutputTokens,
} from '../../lib/agents/cartographer/relation-contract'
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
export const stage1Schema = createRelationStage1Schema(
  relationContract.blocking.candidateLimit,
)
export const stage2Schema = createRelationStage2Schema(
  relationContract.blocking.candidateLimit,
  RELATION_VERDICTS,
)
export const maxOutputTokens = relationMaxOutputTokens(
  relationContract.blocking.candidateLimit,
)

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
): string => buildRelationPrompt(
  { unitId: focus.unitId, claim: focus.claim },
  candidates,
  relationContract.blocking.candidateLimit,
)

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
