import { createHash } from 'node:crypto'
import { extractKnowledge } from '../../lib/agents/cartographer/extractor'
import type { ExtractionAttempt } from '../../lib/agents/cartographer/types'
import corpusDocument from './k5a-c5-extraction-corpus-v2.json'
import {
  connectedCodexModelName,
  getConnectedCodexModel,
} from './connected-codex-model'

type NewlyEligibleEventType = 'document' | 'slack_message' | 'jira_update' | 'explicit'
type KnowledgeType = 'domain' | 'operational' | 'preference'

interface CorpusCase {
  id: string
  stratum: string
  eventType: NewlyEligibleEventType
  content: string
  expectedClaim: string | null
  expectedKnowledgeType: KnowledgeType | null
  expectedAboutPersonId: string | null
  audience: 'private' | 'room'
}

interface HarnessResult {
  id: string
  stratum: string
  eventType: NewlyEligibleEventType
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
}

interface CorpusDocument {
  version: string
  meta: { freeze: { payloadSha256: string } }
  cases: CorpusCase[]
}

const corpus = corpusDocument as CorpusDocument
const expectedPayloadSha256 =
  '84369a79ed9bbecc67f1c02318c5101296db5fa10fa054021d0b03363a44eb5a'
const measuredExtractorVersion = 'cartographer-single-claim-v5'
const measuredModelProvider = 'openai'
const actorPersonId = '10000000-0000-4000-8000-000000000001'
const candidatePersonId = '10000000-0000-4000-8000-000000000002'
const privateAudienceId = '20000000-0000-4000-8000-000000000001'
const roomAudienceId = '20000000-0000-4000-8000-000000000002'

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
  const admitted = new Set<NewlyEligibleEventType>([
    'document', 'slack_message', 'jira_update', 'explicit',
  ])
  if (corpus.version !== 'k5a-c5-labelled-v2') {
    throw new Error(`k5a_c5_corpus_version_invalid:${corpus.version}`)
  }
  if (corpus.cases.length !== 80) throw new Error('k5a_c5_corpus_size_changed')
  const canonicalPayload = `${JSON.stringify(canonicalize({
    version: corpus.version,
    cases: corpus.cases,
  }))}\n`
  const observedPayloadSha256 = createHash('sha256')
    .update(canonicalPayload)
    .digest('hex')
  if (corpus.meta.freeze.payloadSha256 !== expectedPayloadSha256
    || observedPayloadSha256 !== expectedPayloadSha256) {
    throw new Error(`k5a_c5_corpus_payload_changed:${observedPayloadSha256}`)
  }
  if (new Set(corpus.cases.map(({ id }) => id)).size !== corpus.cases.length) {
    throw new Error('k5a_c5_duplicate_case_id')
  }
  admitted.forEach((eventType) => {
    if (!corpus.cases.some((testCase) => testCase.eventType === eventType)) {
      throw new Error(`k5a_c5_shape_missing:${eventType}`)
    }
  })
  corpus.cases.forEach((testCase) => {
    if (!admitted.has(testCase.eventType)) {
      throw new Error(`k5a_c5_shape_not_admitted:${testCase.eventType}`)
    }
    if ((testCase.expectedClaim === null) !== (testCase.expectedKnowledgeType === null)) {
      throw new Error(`k5a_c5_label_shape_invalid:${testCase.id}`)
    }
  })
}

const runCase = async (
  model: ReturnType<typeof getConnectedCodexModel>,
  testCase: CorpusCase,
  index: number,
): Promise<HarnessResult> => {
  const sourceAudienceId = testCase.audience === 'private'
    ? privateAudienceId
    : roomAudienceId
  const attempt: ExtractionAttempt = {
    attemptId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    leaseToken: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    sourceEventId: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    extractorVersion: measuredExtractorVersion,
    knowledgeAudienceId: sourceAudienceId,
    sourceContent: testCase.content,
    sourceEventType: testCase.eventType,
    sourceActorId: actorPersonId,
    sourceSessionId: null,
    attemptNumber: 1,
    candidates: [
      { personId: actorPersonId, displayName: 'The author' },
      { personId: candidatePersonId, displayName: 'Mara' },
    ],
  }
  const extracted = await extractKnowledge(model, attempt)
  if (extracted.kind === 'failed') {
    throw new Error(`k5a_c5_provider_failed:${testCase.id}:${extracted.errorClass}`)
  }
  return {
    id: testCase.id,
    stratum: testCase.stratum,
    eventType: testCase.eventType,
    expected: {
      claim: testCase.expectedClaim,
      knowledgeType: testCase.expectedKnowledgeType,
      aboutPersonId: testCase.expectedAboutPersonId,
    },
    actual: {
      claim: extracted.object.claim,
      knowledgeType: extracted.object.knowledgeType,
      aboutPersonId: extracted.object.aboutPersonId,
    },
  }
}

const main = async (): Promise<void> => {
  assertCorpus()
  const model = getConnectedCodexModel('K5A_C5_CODEX_AUTH_PATH')
  const results: HarnessResult[] = []
  for (let index = 0; index < corpus.cases.length; index++) {
    results.push(await runCase(model, corpus.cases[index], index))
    console.log(`judgedCases=${index + 1}/${corpus.cases.length}`)
  }
  console.log(JSON.stringify({
    corpusVersion: corpus.version,
    corpusPayloadSha256: expectedPayloadSha256,
    measurementPair: {
      contractVersion: measuredExtractorVersion,
      modelProvider: measuredModelProvider,
      modelId: connectedCodexModelName,
    },
    cases: results.length,
    results,
  }, null, 2))
  console.log('K5A_C5_EXTRACTION_MEASUREMENT_COMPLETE')
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
