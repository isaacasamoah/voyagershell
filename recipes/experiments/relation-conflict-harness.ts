import { generateObject } from 'ai'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { getOpenAI } from '../../lib/agents/cartographer/embeddings'
import relationContract from '../../lib/agents/cartographer/relation-conflict-contract.json'
import { CODEX_MODEL, createCodexModel } from '../../lib/models/codex'
import type { ModelRequirements } from '../../lib/models/router'
import corpusDocument from './relation-conflict-corpus.json'
type Verdict = 'contradicts' | 'supersedes'
type ExpectedVerdict = Verdict | 'none'
interface CorpusUnit {
  unitId: string
  claim: string
  topicLabels: string[]
}
interface CorpusCandidate extends CorpusUnit {
  shape: string
  expected: ExpectedVerdict
}
interface CorpusCase {
  subject: string
  focus: CorpusUnit
  candidates: CorpusCandidate[]
}
const corpus = corpusDocument as { cases: CorpusCase[] }
const modelRequirements: ModelRequirements = {
  task: 'classification',
  quality: 'balanced',
}
interface CodexAuthDocument {
  tokens?: {
    access_token?: string
    account_id?: string
  }
}
const requiredShapes = new Set([
  'restatement_not_contradiction',
  'temporal_supersession',
  'cross_topic_conflict',
  'negation',
  'adjacent_compatible',
])
const relationSchema = z.object({
  relations: z.array(z.object({
    candidateUnitId: z.string().uuid(),
    kind: z.enum(['contradicts', 'supersedes']),
    sourceUnitId: z.string().uuid(),
    targetUnitId: z.string().uuid(),
  }).strict()).max(relationContract.blocking.candidateLimit),
}).strict().superRefine((value, context) => {
  const candidateIds = value.relations.map((relation) => relation.candidateUnitId)
  if (new Set(candidateIds).size !== candidateIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'relation_candidates_must_be_unique',
      path: ['relations'],
    })
  }
})
const normalizeTopic = (label: string): string => (
  label.toLowerCase().replace(/\s+/g, ' ').trim()
)

const cosine = (left: number[], right: number[]): number => {
  const dot = left.reduce((sum, value, index) => sum + value * right[index], 0)
  const leftNorm = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0))
  const rightNorm = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0))
  return dot / (leftNorm * rightNorm)
}

const embed = async (inputs: string[]): Promise<number[][]> => {
  const response = await getOpenAI().embeddings.create({
    model: relationContract.blocking.embeddingModel,
    input: inputs,
    dimensions: relationContract.blocking.embeddingDimensions,
  })
  return response.data.map((item) => item.embedding)
}

const hasSharedTopic = (left: string[], right: string[]): boolean => {
  const normalized = new Set(left.map(normalizeTopic))
  return right.some((label) => normalized.has(normalizeTopic(label)))
}
const promptFor = (focus: CorpusUnit, candidates: Array<{
  unitId: string
  claim: string
  topicLabels: string[]
  similarity: number
}>): string => `## Focus KnowledgeUnit
${JSON.stringify(focus)}

## Ordered authorized candidate KnowledgeUnits, nearest first
${JSON.stringify(candidates)}

Return the structured conflict-ledger decisions.`

const score = (counts: { tp: number; fp: number; fn: number }): {
  precision: number
  recall: number
} => ({
  precision: counts.tp + counts.fp === 0 ? 0 : counts.tp / (counts.tp + counts.fp),
  recall: counts.tp + counts.fn === 0 ? 0 : counts.tp / (counts.tp + counts.fn),
})

const getJudgmentModel = (): ReturnType<typeof createCodexModel> => {
  const authPath = process.env.K4C_CODEX_AUTH_PATH
    ?? join(homedir(), '.codex', 'auth.json')
  const document = JSON.parse(
    readFileSync(authPath, 'utf8'),
  ) as CodexAuthDocument
  const accessToken = document.tokens?.access_token
  const accountId = document.tokens?.account_id
  if (!accessToken || !accountId) throw new Error('codex_auth_unavailable')
  return createCodexModel({ accessToken, accountId })
}

const main = async (): Promise<void> => {
  const pairs = corpus.cases.flatMap((testCase) => testCase.candidates)
  const subjects = new Set(corpus.cases.map((testCase) => testCase.subject))
  const shapes = new Set(pairs.map((pair) => pair.shape))
  if (pairs.length < 40 || subjects.size < 10) {
    throw new Error(`corpus_too_small:pairs=${pairs.length}:subjects=${subjects.size}`)
  }
  requiredShapes.forEach((shape) => {
    if (!shapes.has(shape)) throw new Error(`corpus_shape_missing:${shape}`)
  })

  if (relationContract.modelLane.task !== modelRequirements.task
    || relationContract.modelLane.quality !== modelRequirements.quality) {
    throw new Error('relation_contract_model_lane_invalid')
  }
  const model = getJudgmentModel()
  const counts: Record<Verdict, { tp: number; fp: number; fn: number }> = {
    contradicts: { tp: 0, fp: 0, fn: 0 },
    supersedes: { tp: 0, fp: 0, fn: 0 },
  }
  let blockedPositive = 0
  let expectedPositive = 0
  let judgedPairs = 0
  const mismatches: string[] = []

  for (let caseIndex = 0; caseIndex < corpus.cases.length; caseIndex++) {
    const testCase = corpus.cases[caseIndex]
    const vectors = await embed([
      testCase.focus.claim,
      ...testCase.candidates.map((candidate) => candidate.claim),
    ])
    const ranked = testCase.candidates.map((candidate, index) => ({
      ...candidate,
      similarity: cosine(vectors[0], vectors[index + 1]),
    })).sort((left, right) => (
      right.similarity - left.similarity || left.unitId.localeCompare(right.unitId)
    ))
    const selected = ranked.filter((candidate) => (
      hasSharedTopic(testCase.focus.topicLabels, candidate.topicLabels)
      || candidate.similarity >= relationContract.blocking.candidateFloor
    )).slice(0, relationContract.blocking.candidateLimit)
    const selectedIds = new Set(selected.map((candidate) => candidate.unitId))
    const expected = new Map(testCase.candidates.map((candidate) => (
      [candidate.unitId, candidate.expected]
    )))
    expectedPositive += testCase.candidates.filter(({ expected: value }) => value !== 'none').length
    blockedPositive += selected.filter(({ expected: value }) => value !== 'none').length

    const result = await generateObject({
      model,
      system: relationContract.instruction,
      messages: [{
        role: 'user',
        content: promptFor(testCase.focus, selected.map(({
          unitId, claim, topicLabels, similarity,
        }) => ({ unitId, claim, topicLabels, similarity }))),
      }],
      schema: relationSchema,
      maxOutputTokens: 1024,
    })
    judgedPairs += selected.length
    const predicted = new Map(result.object.relations.map((relation) => (
      [relation.candidateUnitId, relation]
    )))

    for (const relation of result.object.relations) {
      const expectedKind = expected.get(relation.candidateUnitId)
      const validEndpoints = relation.sourceUnitId === testCase.focus.unitId
        && relation.targetUnitId === relation.candidateUnitId
      if (!selectedIds.has(relation.candidateUnitId) || !expectedKind) {
        counts[relation.kind].fp++
        mismatches.push(`${testCase.subject}: unexpected ${relation.kind} for ${relation.candidateUnitId}`)
      } else if (relation.kind === expectedKind && validEndpoints) {
        counts[relation.kind].tp++
      } else {
        counts[relation.kind].fp++
        if (expectedKind !== 'none') counts[expectedKind].fn++
        const direction = validEndpoints ? '' : ' with wrong direction'
        mismatches.push(`${testCase.subject}: expected ${expectedKind}, got ${relation.kind}${direction}`)
      }
    }
    for (const candidate of testCase.candidates) {
      if (candidate.expected === 'none') continue
      if (!selectedIds.has(candidate.unitId)) {
        counts[candidate.expected].fn++
        mismatches.push(`${testCase.subject}: blocker missed ${candidate.expected} ${candidate.unitId}`)
      } else if (!predicted.has(candidate.unitId)) {
        counts[candidate.expected].fn++
        mismatches.push(`${testCase.subject}: judge missed ${candidate.expected} ${candidate.unitId}`)
      }
    }
    console.log(`judgedCases=${caseIndex + 1}/${corpus.cases.length}`)
  }

  const contradicts = score(counts.contradicts)
  const supersedes = score(counts.supersedes)
  const totalTp = counts.contradicts.tp + counts.supersedes.tp
  const totalFn = counts.contradicts.fn + counts.supersedes.fn
  const combinedRecall = totalTp / (totalTp + totalFn)
  console.log(`contract=${relationContract.version} model=openai/${CODEX_MODEL}`)
  console.log(`corpusPairs=${pairs.length} subjects=${subjects.size} hardShapes=${shapes.size}`)
  console.log(
    `blockingFloor=${relationContract.blocking.candidateFloor.toFixed(3)} `
      + `blockingLimit=${relationContract.blocking.candidateLimit} `
      + `positiveRecall=${(blockedPositive / expectedPositive).toFixed(3)} `
      + `judgedPairs=${judgedPairs}`,
  )
  console.log(
    `contradicts precision=${contradicts.precision.toFixed(3)} `
      + `recall=${contradicts.recall.toFixed(3)} tp=${counts.contradicts.tp} `
      + `fp=${counts.contradicts.fp} fn=${counts.contradicts.fn}`,
  )
  console.log(
    `supersedes precision=${supersedes.precision.toFixed(3)} `
      + `recall=${supersedes.recall.toFixed(3)} tp=${counts.supersedes.tp} `
      + `fp=${counts.supersedes.fp} fn=${counts.supersedes.fn}`,
  )
  console.log(`combinedRecall=${combinedRecall.toFixed(3)}`)
  for (const mismatch of mismatches) console.log(`MISMATCH: ${mismatch}`)

  if (contradicts.precision !== 1 || supersedes.precision !== 1
    || contradicts.recall < 0.75 || supersedes.recall < 0.75) {
    throw new Error('relation_conflict_harness_acceptance_failed')
  }
  console.log('K4C_CONFLICT_HARNESS_GREEN')
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
