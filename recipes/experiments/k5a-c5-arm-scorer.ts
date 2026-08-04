// Scores a k5a-c5-extraction-harness run against the EXACT arms, bars and
// strata recorded in docs/testing/receipts/memory/k5a-c5-v5-one-shot-result-
// 2026-08-03.md. This file computes; it never decides. Every bar below is a
// constant transcribed from that receipt so a rerun cannot silently move one.
//
// Usage: vite-node recipes/experiments/k5a-c5-arm-scorer.ts -- <harness-log>

import { readFileSync } from 'node:fs'

type KnowledgeType = 'domain' | 'operational' | 'preference'

interface HarnessCase {
  id: string
  stratum: string
  eventType: string
  expected: {
    claim: string | null
    knowledgeType: KnowledgeType | null
    aboutPersonId: string | null
  }
  actual: {
    claim: string | null
    knowledgeType: KnowledgeType
    aboutPersonId: string | null
  }
  usage: { inputTokens: number | undefined; outputTokens: number | undefined }
}

interface HarnessArm {
  corpusVersion: string
  corpusPayloadSha256: string
  measurementPair: {
    contractVersion: string
    modelProvider: string
    modelId: string
  }
  cases: number
  usageTotals: {
    inputTokens: number
    outputTokens: number
    inputReportedCases: number
    outputReportedCases: number
  }
  results: HarnessCase[]
}

// Transcribed from the 2026-08-03 receipt. Not re-derived, not recomputed.
const RECORDED_V5 = {
  hardCoreFalseDurable: [
    'v2-ctl-core-doc-03',
    'v2-ctl-core-slack-02',
    'v2-ctl-core-slack-03',
    'v2-ctl-core-jira-04',
    'v2-ctl-core-explicit-07',
  ],
  aboutPersonMiss: ['v2-pos-op-jira-03'],
} as const

const ACTOR_PERSON_ID = '10000000-0000-4000-8000-000000000001'
const CANDIDATE_PERSON_ID = '10000000-0000-4000-8000-000000000002'

const extractArms = (log: string): HarnessArm[] => {
  const lines = log.split('\n')
  const arms: HarnessArm[] = []
  let buffer: string[] | null = null
  lines.forEach((line) => {
    if (line === '{') buffer = []
    if (buffer !== null) buffer.push(line)
    if (line === '}' && buffer !== null) {
      arms.push(JSON.parse(buffer.join('\n')) as HarnessArm)
      buffer = null
    }
  })
  return arms
}

const ids = (cases: HarnessCase[]): string[] => cases.map(({ id }) => id).sort()

const inStratum = (arm: HarnessArm, ...strata: string[]): HarnessCase[] =>
  arm.results.filter((entry) => strata.includes(entry.stratum))

const positives = (arm: HarnessArm): HarnessCase[] =>
  arm.results.filter((entry) => entry.expected.claim !== null)

interface ArmScore {
  arm: string
  bar: string
  n: number
  score: string
  gated: boolean
  passed: boolean | null
  failingCaseIds: string[]
}

const scoreArm = (arm: HarnessArm): ArmScore[] => {
  const scores: ArmScore[] = []

  // 1a Meaning fidelity — bar 100%, n=40. The entailment judgement is human.
  // What is mechanical is whether a positive produced a claim AT ALL; a null
  // claim on a labelled positive cannot be faithful, so it is a floor, not the
  // full arm.
  const pos = positives(arm)
  const silentPositives = pos.filter((entry) => entry.actual.claim === null)
  scores.push({
    arm: '1a Meaning fidelity (mechanical floor: positive emitted a claim)',
    bar: '100%, n=40 — entailment judged by hand',
    n: pos.length,
    score: `${pos.length - silentPositives.length}/${pos.length} emitted a claim`,
    gated: true,
    passed: silentPositives.length === 0 ? null : false,
    failingCaseIds: ids(silentPositives),
  })

  // 1b Hard-core false durability — bar zero, n=30.
  const hardCore = inStratum(arm, 'control-hard-core')
  const falseDurable = hardCore.filter((entry) => entry.actual.claim !== null)
  scores.push({
    arm: '1b Hard-core false durability',
    bar: 'zero false durable, n=30',
    n: hardCore.length,
    score: `${falseDurable.length}/${hardCore.length} false durable`,
    gated: true,
    passed: falseDurable.length === 0,
    failingCaseIds: ids(falseDurable),
  })

  // 2a Preference boundary, both gated directions — bar 100%.
  const prefs = inStratum(arm, 'positive-preference')
  const prefMissed = prefs.filter(
    (entry) => entry.actual.knowledgeType !== 'preference',
  )
  const nonPrefs = inStratum(arm, 'positive-operational', 'positive-domain')
  const nonPrefLeaked = nonPrefs.filter(
    (entry) => entry.actual.knowledgeType === 'preference',
  )
  scores.push({
    arm: '2a Preference boundary — true preferences returned preference',
    bar: '100%, n=13',
    n: prefs.length,
    score: `${prefs.length - prefMissed.length}/${prefs.length}`,
    gated: true,
    passed: prefMissed.length === 0,
    failingCaseIds: ids(prefMissed),
  })
  scores.push({
    arm: '2a Preference boundary — gated non-preferences did not return preference',
    bar: '100%, n=26',
    n: nonPrefs.length,
    score: `${nonPrefs.length - nonPrefLeaked.length}/${nonPrefs.length}`,
    gated: true,
    passed: nonPrefLeaked.length === 0,
    failingCaseIds: ids(nonPrefLeaked),
  })

  // 2b Zeroing-direction type error — bar zero operational/preference -> domain.
  const zeroing = inStratum(arm, 'positive-preference', 'positive-operational')
  const zeroingErrors = zeroing.filter(
    (entry) => entry.actual.knowledgeType === 'domain',
  )
  scores.push({
    arm: '2b Zeroing-direction type error (operational/preference → domain)',
    bar: 'zero, n=30',
    n: zeroing.length,
    score: `${zeroingErrors.length}/${zeroing.length} errors`,
    gated: true,
    passed: zeroingErrors.length === 0,
    failingCaseIds: ids(zeroingErrors),
  })

  // 3 About-person exact attribution — bar 100%, n=40.
  const aboutMiss = pos.filter(
    (entry) => entry.actual.aboutPersonId !== entry.expected.aboutPersonId,
  )
  scores.push({
    arm: '3 About-person exact attribution',
    bar: '100%, n=40',
    n: pos.length,
    score: `${pos.length - aboutMiss.length}/${pos.length}`,
    gated: true,
    passed: aboutMiss.length === 0,
    failingCaseIds: ids(aboutMiss),
  })

  // 3' Fabricated Person ID — bar zero, n=40.
  const fabricated = pos.filter((entry) => (
    entry.actual.aboutPersonId !== null
    && entry.actual.aboutPersonId !== ACTOR_PERSON_ID
    && entry.actual.aboutPersonId !== CANDIDATE_PERSON_ID
  ))
  scores.push({
    arm: "3' Fabricated Person ID",
    bar: 'zero, n=40',
    n: pos.length,
    score: `${fabricated.length}/${pos.length}`,
    gated: true,
    passed: fabricated.length === 0,
    failingCaseIds: ids(fabricated),
  })

  // 1b' Durability rim — reported, not gated, n=11.
  const rim = inStratum(arm, 'control-rim')
  const rimDurable = rim.filter((entry) => entry.actual.claim !== null)
  scores.push({
    arm: "1b' Durability rim",
    bar: 'reported, not gated, n=11',
    n: rim.length,
    score: `${rimDurable.length} durable; ${rim.length - rimDurable.length} null`,
    gated: false,
    passed: null,
    failingCaseIds: ids(rimDurable),
  })

  // 2c domain -> operational — reported; correct-domain rate floor 0.60, n=9.
  const domains = inStratum(arm, 'positive-domain')
  const domainKept = domains.filter(
    (entry) => entry.actual.knowledgeType === 'domain',
  )
  const rate = domains.length === 0 ? 0 : domainKept.length / domains.length
  scores.push({
    arm: '2c domain → operational (correct-domain rate)',
    bar: 'reported; collapse floor 0.60, n=9',
    n: domains.length,
    score: `${domainKept.length}/${domains.length} = ${rate.toFixed(3)}`,
    gated: false,
    passed: rate >= 0.6,
    failingCaseIds: ids(domains.filter(
      (entry) => entry.actual.knowledgeType !== 'domain',
    )),
  })

  // Type rim — reported, not gated, n=1.
  const typeRim = inStratum(arm, 'positive-type-rim')
  scores.push({
    arm: 'Type rim',
    bar: 'reported, not gated, n=1',
    n: typeRim.length,
    score: typeRim
      .map((entry) => `${entry.id} returned ${entry.actual.knowledgeType}`)
      .join('; '),
    gated: false,
    passed: null,
    failingCaseIds: [],
  })

  return scores
}

const relate = (left: string[], right: string[]): string => {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  const shared = left.filter((id) => rightSet.has(id))
  if (left.length === 0 && right.length === 0) return 'both empty'
  if (shared.length === 0) return 'DISJOINT'
  if (shared.length === left.length && shared.length === right.length) {
    return 'IDENTICAL'
  }
  if (shared.length === left.length) return 'LEFT is a strict SUBSET of RIGHT'
  if (shared.length === rightSet.size) return 'RIGHT is a strict SUBSET of LEFT'
  return 'OVERLAPPING but neither contains the other'
}

const main = (): void => {
  const logPath = process.argv.slice(2)[0]
  if (!logPath) throw new Error('k5a_c5_scorer_log_path_required')
  const arms = extractArms(readFileSync(logPath, 'utf8'))
  const report: Record<string, unknown> = {}

  arms.forEach((arm) => {
    const scores = scoreArm(arm)
    report[arm.measurementPair.contractVersion] = {
      measurementPair: arm.measurementPair,
      corpusVersion: arm.corpusVersion,
      corpusPayloadSha256: arm.corpusPayloadSha256,
      cases: arm.cases,
      usageTotals: arm.usageTotals,
      scores,
    }
  })

  const armFor = (version: string): HarnessArm | undefined =>
    arms.find((arm) => arm.measurementPair.contractVersion === version)
  const v4 = armFor('cartographer-single-claim-v4')
  const v5 = armFor('cartographer-single-claim-v5')

  const setOf = (arm: HarnessArm | undefined, armName: string): string[] => {
    if (!arm) return []
    const found = scoreArm(arm).find((entry) => entry.arm.startsWith(armName))
    return found ? found.failingCaseIds : []
  }

  const v4HardCore = setOf(v4, '1b Hard-core')
  const v5HardCore = setOf(v5, '1b Hard-core')
  const v4About = setOf(v4, '3 About-person')
  const v5About = setOf(v5, '3 About-person')

  report.setRelationships = {
    hardCoreFalseDurable: {
      v4Fresh: v4HardCore,
      v5Fresh: v5HardCore,
      v5Recorded: [...RECORDED_V5.hardCoreFalseDurable],
      v5FreshVsV4Fresh: relate(v5HardCore, v4HardCore),
      v5FreshVsV5Recorded: relate(
        v5HardCore,
        [...RECORDED_V5.hardCoreFalseDurable],
      ),
      sharedByBothFresh: v4HardCore.filter((id) => v5HardCore.includes(id)),
      v4FreshOnly: v4HardCore.filter((id) => !v5HardCore.includes(id)),
      v5FreshOnly: v5HardCore.filter((id) => !v4HardCore.includes(id)),
    },
    aboutPerson: {
      v4Fresh: v4About,
      v5Fresh: v5About,
      v5Recorded: [...RECORDED_V5.aboutPersonMiss],
      v5FreshVsV4Fresh: relate(v5About, v4About),
      v5FreshVsV5Recorded: relate(v5About, [...RECORDED_V5.aboutPersonMiss]),
      sharedByBothFresh: v4About.filter((id) => v5About.includes(id)),
      v4FreshOnly: v4About.filter((id) => !v5About.includes(id)),
      v5FreshOnly: v5About.filter((id) => !v4About.includes(id)),
      v4AlsoMissesRecordedV5Case: v4About.includes('v2-pos-op-jira-03'),
    },
  }

  console.log(JSON.stringify(report, null, 2))
  console.log('K5A_C5_ARM_SCORING_COMPLETE')
}

main()
