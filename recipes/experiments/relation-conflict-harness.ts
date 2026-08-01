import { generateObject } from 'ai'
import relationContract from '../../lib/agents/cartographer/relation-conflict-contract.json'
import {
  assertExactCoverage,
  corpus,
  cosine,
  embed,
  getJudgmentModel,
  hasSharedTopic,
  judgmentModelName,
  maxOutputTokens,
  modelRequirements,
  promptFor,
  requiredShapes,
  score,
  stage1Schema,
  stage2Schema,
} from './relation-conflict-harness-support'
import type { ConflictVerdict, ExpectedVerdict, Verdict } from './relation-conflict-harness-support'

const main = async (): Promise<void> => {
  const pairs = corpus.cases.flatMap((testCase) => testCase.candidates)
  const subjects = new Set(corpus.cases.map((testCase) => testCase.subject))
  const shapes = new Set(pairs.map((pair) => pair.shape))
  if (pairs.length < 40 || subjects.size < 10) {
    throw new Error(
      `corpus_too_small:pairs=${pairs.length}:subjects=${subjects.size}`,
    )
  }
  requiredShapes.forEach((shape) => {
    if (!shapes.has(shape)) throw new Error(`corpus_shape_missing:${shape}`)
  })

  if (
    relationContract.modelLane.task !== modelRequirements.task ||
    relationContract.modelLane.quality !== modelRequirements.quality
  ) {
    throw new Error('relation_contract_model_lane_invalid')
  }
  const model = getJudgmentModel()
  const counts: Record<Verdict, { tp: number; fp: number; fn: number }> = {
    contradicts: { tp: 0, fp: 0, fn: 0 },
    supersedes: { tp: 0, fp: 0, fn: 0 },
  }
  const conflictCounts = { tp: 0, fp: 0, fn: 0 }
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
    const ranked = testCase.candidates
      .map((candidate, index) => ({
        ...candidate,
        similarity: cosine(vectors[0], vectors[index + 1]),
      }))
      .sort(
        (left, right) =>
          right.similarity - left.similarity ||
          left.unitId.localeCompare(right.unitId),
      )
    const selected = ranked
      .filter(
        (candidate) =>
          hasSharedTopic(testCase.focus.topicLabels, candidate.topicLabels) ||
          candidate.similarity >= relationContract.blocking.candidateFloor,
      )
      .slice(0, relationContract.blocking.candidateLimit)
    const selectedIds = new Set(selected.map((candidate) => candidate.unitId))
    const expected = new Map(
      testCase.candidates.map((candidate) => [
        candidate.unitId,
        candidate.expected,
      ]),
    )
    expectedPositive += testCase.candidates.filter(
      ({ expected: value }) => value !== 'none',
    ).length
    blockedPositive += selected.filter(
      ({ expected: value }) => value !== 'none',
    ).length

    const promptCandidates = selected.map(
      ({ unitId, claim, topicLabels, similarity }) => ({
        unitId,
        claim,
        topicLabels,
        similarity,
      }),
    )
    const stage1Result = await generateObject({
      model,
      system: relationContract.stage1Instruction,
      messages: [
        {
          role: 'user',
          content: promptFor(testCase.focus, promptCandidates),
        },
      ],
      schema: stage1Schema,
      maxOutputTokens,
    })
    judgedPairs += selected.length
    const stage1 = new Map(
      stage1Result.object.decisions.map((decision) => [
        decision.candidateUnitId,
        decision,
      ]),
    )
    assertExactCoverage(
      selected.map(({ unitId }) => unitId),
      stage1Result.object.decisions.map(
        ({ candidateUnitId }) => candidateUnitId,
      ),
      `stage1:${testCase.subject}`,
    )
    const conflictCandidates = promptCandidates.filter(
      ({ unitId }) => stage1.get(unitId)?.conflict === 'conflict',
    )
    const stage2Relations =
      conflictCandidates.length === 0
        ? []
        : (
            await generateObject({
              model,
              system: relationContract.stage2Instruction,
              messages: [
                {
                  role: 'user',
                  content: promptFor(testCase.focus, conflictCandidates),
                },
              ],
              schema: stage2Schema,
              maxOutputTokens,
            })
          ).object.relations
    assertExactCoverage(
      conflictCandidates.map(({ unitId }) => unitId),
      stage2Relations.map(({ candidateUnitId }) => candidateUnitId),
      `stage2:${testCase.subject}`,
    )
    const relations = new Map(
      stage2Relations.map((relation) => [relation.candidateUnitId, relation]),
    )

    for (const candidate of selected) {
      const expectedKind = expected.get(candidate.unitId) as ExpectedVerdict
      const expectedConflict: ConflictVerdict =
        expectedKind === 'none' ? 'none' : 'conflict'
      const decision = stage1.get(candidate.unitId)
      const relation = relations.get(candidate.unitId)
      if (decision?.conflict === 'conflict') {
        if (expectedConflict === 'conflict') conflictCounts.tp++
        else conflictCounts.fp++
      } else if (expectedConflict === 'conflict') conflictCounts.fn++
      if (!relation) {
        if (expectedKind !== 'none') counts[expectedKind].fn++
        continue
      }
      const validEndpoints =
        relation.sourceUnitId === testCase.focus.unitId &&
        relation.targetUnitId === candidate.unitId
      if (relation.verdict === expectedKind && validEndpoints) {
        counts[relation.verdict].tp++
      } else {
        counts[relation.verdict].fp++
        if (expectedKind !== 'none') counts[expectedKind].fn++
        const direction = validEndpoints ? '' : ' with wrong direction'
        mismatches.push(
          `${testCase.subject}: expected ${expectedKind}, got ${relation.verdict}${direction}`,
        )
      }
    }
    for (const candidate of testCase.candidates) {
      if (candidate.expected !== 'none' && !selectedIds.has(candidate.unitId)) {
        counts[candidate.expected].fn++
        mismatches.push(
          `${testCase.subject}: blocker missed ${candidate.expected} ${candidate.unitId}`,
        )
      } else if (
        candidate.expected !== 'none' &&
        stage1.get(candidate.unitId)?.conflict !== 'conflict'
      ) {
        mismatches.push(
          `${testCase.subject}: judge missed ${candidate.expected} ${candidate.unitId}`,
        )
      }
    }
    console.log(`judgedCases=${caseIndex + 1}/${corpus.cases.length}`)
  }

  const contradicts = score(counts.contradicts)
  const supersedes = score(counts.supersedes)
  const conflict = score(conflictCounts)
  const totalTp = counts.contradicts.tp + counts.supersedes.tp
  const totalFn = counts.contradicts.fn + counts.supersedes.fn
  const combinedRecall = totalTp / (totalTp + totalFn)
  console.log(
    `contract=${relationContract.version} model=openai/${judgmentModelName}`,
  )
  console.log(
    `judgmentStages=2 providerCallsPerCase=${relationContract.judgment.providerCallsPerJob}`,
  )
  console.log(
    `corpusPairs=${pairs.length} subjects=${subjects.size} hardShapes=${shapes.size}`,
  )
  console.log(
    `conflict precision=${conflict.precision.toFixed(3)} ` +
      `recall=${conflict.recall.toFixed(3)} tp=${conflictCounts.tp} ` +
      `fp=${conflictCounts.fp} fn=${conflictCounts.fn}`,
  )
  console.log(
    `blockingFloor=${relationContract.blocking.candidateFloor.toFixed(3)} ` +
      `blockingLimit=${relationContract.blocking.candidateLimit} ` +
      `positiveRecall=${(blockedPositive / expectedPositive).toFixed(3)} ` +
      `judgedPairs=${judgedPairs}`,
  )
  console.log(
    `contradicts precision=${contradicts.precision.toFixed(3)} ` +
      `recall=${contradicts.recall.toFixed(3)} tp=${counts.contradicts.tp} ` +
      `fp=${counts.contradicts.fp} fn=${counts.contradicts.fn}`,
  )
  console.log(
    `supersedes precision=${supersedes.precision.toFixed(3)} ` +
      `recall=${supersedes.recall.toFixed(3)} tp=${counts.supersedes.tp} ` +
      `fp=${counts.supersedes.fp} fn=${counts.supersedes.fn}`,
  )
  console.log(`combinedRecall=${combinedRecall.toFixed(3)}`)
  for (const mismatch of mismatches) console.log(`MISMATCH: ${mismatch}`)

  if (
    supersedes.precision !== 1 ||
    contradicts.precision < 0.90 ||
    contradicts.recall < 0.75 ||
    supersedes.recall < 0.75
  ) {
    throw new Error('relation_conflict_harness_acceptance_failed')
  }
  console.log('K4C_CONFLICT_HARNESS_GREEN')
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
