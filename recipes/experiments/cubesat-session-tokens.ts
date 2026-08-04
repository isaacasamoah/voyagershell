import { encoding_for_model } from 'tiktoken'
import { buildExtractionInput } from '../../lib/agents/cartographer/extractor'
import type { ExtractionAttempt } from '../../lib/agents/cartographer/types'
import corpusDocument from './cubesat-session-corpus.json'

// Token cost of the context change, counted on the exact strings the runtime
// sends. The uncapped-context arm is absent on purpose: the fixture stores
// only the capped slice, so that figure is recorded in the receipt as a
// pre-reduction measurement rather than emitted here where it could not be
// reproduced. The connected provider reports no usage, so provider-reported counts
// come back undefined; this measures the input we construct, which is the half
// the change actually controls. No model calls -- deterministic and free.
interface CorpusCase {
  id: string
  content: string
  precedingAssistantTurn: string | null
}

const corpus = corpusDocument as {
  meta: { sessionSubject: string }
  cases: CorpusCase[]
}

const SESSION_CONTEXT_CHARS = 1200
const actorPersonId = '10000000-0000-4000-8000-000000000001'

const capped = (value: string | null): string | null => {
  if (value === null) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  return trimmed.length <= SESSION_CONTEXT_CHARS
    ? trimmed
    : `${trimmed.slice(0, SESSION_CONTEXT_CHARS)}…`
}

const ARMS: Array<{
  label: string
  extractorVersion: string
  context: (c: CorpusCase) => string | null
}> = [
  { label: 'v5-none', extractorVersion: 'cartographer-single-claim-v5', context: () => null },
  { label: 'v6-none', extractorVersion: 'cartographer-single-claim-v6', context: () => null },
  {
    label: 'v6-subject',
    extractorVersion: 'cartographer-single-claim-v6',
    context: () => corpus.meta.sessionSubject,
  },
  {
    label: 'v6-preceding',
    extractorVersion: 'cartographer-single-claim-v6',
    context: (c) => capped(c.precedingAssistantTurn),
  },
]

const main = (): void => {
  const encoder = encoding_for_model('gpt-4o')
  const rows = ARMS.map((arm) => {
    let total = 0
    let worst = 0
    for (const testCase of corpus.cases) {
      const attempt = {
        attemptId: '60000000-0000-4000-8000-000000000001',
        leaseToken: '61000000-0000-4000-8000-000000000001',
        sourceEventId: '62000000-0000-4000-8000-000000000001',
        extractorVersion: arm.extractorVersion,
        knowledgeAudienceId: '20000000-0000-4000-8000-000000000001',
        sourceContent: testCase.content,
        sourceEventType: 'message',
        sourceActorId: actorPersonId,
        sourceSessionId: '63000000-0000-4000-8000-000000000001',
        sessionContext: arm.context(testCase),
        attemptNumber: 1,
        candidates: [{ personId: actorPersonId, displayName: 'Isaac' }],
      } satisfies ExtractionAttempt
      const { system, prompt } = buildExtractionInput(attempt)
      const tokens = encoder.encode(`${system}\n${prompt}`).length
      total += tokens
      worst = Math.max(worst, tokens)
    }
    return {
      arm: arm.label,
      meanInputTokensPerExtraction: Math.round(total / corpus.cases.length),
      worstCaseInputTokens: worst,
      sessionTotalInputTokens: total,
    }
  })
  encoder.free()

  const baseline = rows[0].sessionTotalInputTokens
  console.log(JSON.stringify({
    tokenizer: 'tiktoken/gpt-4o (cl100k-family proxy for the served model)',
    userTurns: corpus.cases.length,
    rows: rows.map((row) => ({
      ...row,
      multiplierVsBaseline: Number((row.sessionTotalInputTokens / baseline).toFixed(2)),
    })),
  }, null, 2))
  console.log('CUBESAT_TOKEN_MEASUREMENT_COMPLETE')
}

main()
