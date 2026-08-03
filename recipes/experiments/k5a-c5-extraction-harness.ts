import { extractKnowledge } from '../../lib/agents/cartographer/extractor'
import { CARTOGRAPHER_EXTRACTOR_VERSION } from '../../lib/agents/cartographer/contract'
import type { ExtractionAttempt } from '../../lib/agents/cartographer/types'
import corpusDocument from './k5a-c5-extraction-corpus.json'
import {
  connectedCodexModelName,
  getConnectedCodexModel,
} from './connected-codex-model'

type NewlyEligibleEventType = 'document' | 'slack_message' | 'jira_update' | 'explicit'
type KnowledgeType = 'domain' | 'operational' | 'preference'

interface CorpusCase {
  id: string
  eventType: NewlyEligibleEventType
  content: string
  expectedClaim: string | null
  expectedKnowledgeType: KnowledgeType | null
  expectedAboutPersonId: string | null
  audience: 'private' | 'room'
}

interface HarnessResult {
  id: string
  eventType: NewlyEligibleEventType
  sourceAudienceId: string
  attemptAudienceId: string
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

const corpus = corpusDocument as { version: string; cases: CorpusCase[] }
const actorPersonId = '10000000-0000-4000-8000-000000000001'
const candidatePersonId = '10000000-0000-4000-8000-000000000002'
const privateAudienceId = '20000000-0000-4000-8000-000000000001'
const roomAudienceId = '20000000-0000-4000-8000-000000000002'

const assertCorpus = (): void => {
  const admitted = new Set<NewlyEligibleEventType>([
    'document', 'slack_message', 'jira_update', 'explicit',
  ])
  if (corpus.cases.length < 20) throw new Error('k5a_c5_corpus_too_small')
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
    extractorVersion: CARTOGRAPHER_EXTRACTOR_VERSION,
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
    eventType: testCase.eventType,
    sourceAudienceId,
    attemptAudienceId: attempt.knowledgeAudienceId,
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
  const audienceMatches = results.filter(
    ({ sourceAudienceId, attemptAudienceId }) => sourceAudienceId === attemptAudienceId,
  ).length
  console.log(JSON.stringify({
    corpusVersion: corpus.version,
    model: `openai/${connectedCodexModelName}`,
    cases: results.length,
    audienceInheritance: `${audienceMatches}/${results.length}`,
    results,
  }, null, 2))
  if (audienceMatches !== results.length) {
    throw new Error('k5a_c5_audience_inheritance_failed')
  }
  console.log('K5A_C5_EXTRACTION_MEASUREMENT_COMPLETE')
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
