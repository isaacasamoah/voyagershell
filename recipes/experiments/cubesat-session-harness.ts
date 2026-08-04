import { createHash } from 'node:crypto'
import { extractKnowledge } from '../../lib/agents/cartographer/extractor'
import type { ExtractionAttempt } from '../../lib/agents/cartographer/types'
import corpusDocument from './cubesat-session-corpus.json'
import {
  connectedCodexModelName,
  getConnectedCodexModel,
} from './connected-codex-model'

// Replays the ruled cases from Isaac's real 2026-08-04 session against the
// extractor so the context change has a measured before/after rather than an
// argument. Four arms in ONE process, one variable at a time: the contract
// change and the context change are separated, and the two context shapes are
// compared head to head.
//
// The corpus is REDUCED FOR PRIVACY to the five ruled cases -- see the
// reduction note in the fixture. That is not a claim that five is the better
// instrument.
type Assertion =
  | 'not_preference'
  | 'is_preference'
  | 'subject_present'
  | 'unconstrained'

interface CorpusCase {
  id: string
  at: string
  content: string
  precedingAssistantTurn: string | null
  assert: Assertion
  subjectTerms?: string[]
  note: string
}

interface CorpusDocument {
  version: string
  meta: { sessionSubject: string; freeze: { payloadSha256: string } }
  cases: CorpusCase[]
}

const corpus = corpusDocument as CorpusDocument
const expectedPayloadSha256 =
  '0e49b2efc5747bb16110ed53a5f6bcaaa6e0bdeec142966c6e7202832bf6c0c7'

// How much of the preceding turn the runtime carries. Must track
// SESSION_CONTEXT_CHARS in lib/agents/cartographer/jobs.ts or the measurement
// describes an input the runtime never sends.
const SESSION_CONTEXT_CHARS = 1200

const actorPersonId = '10000000-0000-4000-8000-000000000001'
const audienceId = '20000000-0000-4000-8000-000000000001'

interface Arm {
  label: string
  extractorVersion: string
  context: (testCase: CorpusCase) => string | null
}

const precedingTail = (testCase: CorpusCase): string | null => {
  const turn = testCase.precedingAssistantTurn
  if (turn === null) return null
  const trimmed = turn.trim()
  if (trimmed.length === 0) return null
  return trimmed.length <= SESSION_CONTEXT_CHARS
    ? trimmed
    : `${trimmed.slice(0, SESSION_CONTEXT_CHARS)}…`
}

const ARMS: Arm[] = [
  // Today, after commit 1. The baseline the fix has to beat.
  { label: 'v5-none', extractorVersion: 'cartographer-single-claim-v5', context: () => null },
  // Isolates the prompt change: does deleting the anti-context line alone move
  // anything when there is no context to reach for? It should not.
  { label: 'v6-none', extractorVersion: 'cartographer-single-claim-v6', context: () => null },
  // The brief's cheap option. One subject for the whole session -- which this
  // session contradicts, because it changes subject at cubesat-08.
  {
    label: 'v6-subject',
    extractorVersion: 'cartographer-single-claim-v6',
    context: () => corpus.meta.sessionSubject,
  },
  // Where the probe proved every disambiguator actually lives.
  {
    label: 'v6-preceding',
    extractorVersion: 'cartographer-single-claim-v6',
    context: precedingTail,
  },
]

interface CaseResult {
  id: string
  assert: Assertion
  claim: string | null
  knowledgeType: string
  inputTokens: number | undefined
  outputTokens: number | undefined
  passed: boolean | null
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }
  return value
}

const assertCorpus = (): void => {
  if (corpus.version !== 'cubesat-session-v1') {
    throw new Error(`cubesat_corpus_version_invalid:${corpus.version}`)
  }
  if (corpus.cases.length !== 5) throw new Error('cubesat_corpus_size_changed')
  const payload = `${JSON.stringify(canonicalize({
    version: corpus.version,
    cases: corpus.cases,
  }))}\n`
  const observed = createHash('sha256').update(payload).digest('hex')
  if (observed !== expectedPayloadSha256
    || corpus.meta.freeze.payloadSha256 !== expectedPayloadSha256) {
    throw new Error(`cubesat_corpus_payload_changed:${observed}`)
  }
  const ruled = corpus.cases.filter((c) => c.assert !== 'unconstrained')
  if (ruled.length !== 5) throw new Error(`cubesat_ruled_case_count:${ruled.length}`)
}

const judge = (testCase: CorpusCase, claim: string | null, type: string) => {
  if (testCase.assert === 'unconstrained') return null
  if (claim === null) {
    // A null claim fails every ruled expectation: each ruled case asserts
    // something about a claim that should exist.
    return false
  }
  const lowered = claim.toLowerCase()
  if (testCase.assert === 'is_preference') return type === 'preference'
  if (testCase.assert === 'not_preference') return type !== 'preference'
  return (testCase.subjectTerms ?? []).some((term) => lowered.includes(term))
}

const runArm = async (
  model: ReturnType<typeof getConnectedCodexModel>,
  arm: Arm,
): Promise<{ arm: string; results: CaseResult[] }> => {
  const results: CaseResult[] = []
  for (let index = 0; index < corpus.cases.length; index++) {
    const testCase = corpus.cases[index]
    const attempt: ExtractionAttempt = {
      attemptId: `60000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      leaseToken: `61000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      sourceEventId: `62000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      extractorVersion: arm.extractorVersion,
      knowledgeAudienceId: audienceId,
      sourceContent: testCase.content,
      sourceEventType: 'message',
      sourceActorId: actorPersonId,
      sourceSessionId: '63000000-0000-4000-8000-000000000001',
      sessionContext: arm.context(testCase),
      attemptNumber: 1,
      candidates: [{ personId: actorPersonId, displayName: 'Isaac' }],
    }
    const extracted = await extractKnowledge(model, attempt)
    if (extracted.kind === 'failed') {
      throw new Error(`cubesat_provider_failed:${arm.label}:${testCase.id}:${extracted.errorClass}`)
    }
    results.push({
      id: testCase.id,
      assert: testCase.assert,
      claim: extracted.object.claim,
      knowledgeType: extracted.object.knowledgeType,
      inputTokens: extracted.inputTokens,
      outputTokens: extracted.outputTokens,
      passed: judge(testCase, extracted.object.claim, extracted.object.knowledgeType),
    })
    console.log(`${arm.label} ${index + 1}/${corpus.cases.length}`)
  }
  return { arm: arm.label, results }
}

const main = async (): Promise<void> => {
  assertCorpus()
  const model = getConnectedCodexModel('CUBESAT_CODEX_AUTH_PATH')
  const arms = []
  for (const arm of ARMS) arms.push(await runArm(model, arm))

  const summary = arms.map(({ arm, results }) => {
    const ruled = results.filter((r) => r.passed !== null)
    const totalInput = results.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0)
    return {
      arm,
      ruledPassed: ruled.filter((r) => r.passed).length,
      ruledTotal: ruled.length,
      failed: ruled.filter((r) => !r.passed).map((r) => r.id),
      claimsExtracted: results.filter((r) => r.claim !== null).length,
      totalInputTokens: totalInput,
      meanInputTokensPerExtraction: Math.round(totalInput / results.length),
    }
  })

  const baseline = summary.find((s) => s.arm === 'v5-none')
  console.log(JSON.stringify({
    corpusVersion: corpus.version,
    corpusPayloadSha256: expectedPayloadSha256,
    modelId: connectedCodexModelName,
    summary: summary.map((s) => ({
      ...s,
      tokenMultiplierVsBaseline: baseline && baseline.totalInputTokens > 0
        ? Number((s.totalInputTokens / baseline.totalInputTokens).toFixed(2))
        : null,
    })),
    arms,
  }, null, 2))
  console.log('CUBESAT_SESSION_MEASUREMENT_COMPLETE')
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
