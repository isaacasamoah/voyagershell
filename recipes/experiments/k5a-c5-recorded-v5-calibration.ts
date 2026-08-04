// Scorer calibration fixture.
//
// Rebuilds the 2026-08-03 RECORDED v5 run's per-case outputs from the full
// per-case table in docs/testing/receipts/memory/k5a-c5-v5-one-shot-result-
// 2026-08-03.md, in the exact shape k5a-c5-extraction-harness.ts emits. Feeding
// this to k5a-c5-arm-scorer.ts must reproduce that receipt's published numbers.
// If it does not, the scorer is wrong and no v4 number it emits is trustworthy.
//
// This is a TRANSCRIPTION of a published result. It runs no model, touches no
// database, and is not a rerun of v5. Expected values are read from the sealed
// corpus rather than retyped, so only ACTUALS are transcribed here.
//
// The scorer tests claim NULLITY, never claim text, so recorded non-null claims
// are represented by a sentinel rather than retyped prose.

import corpusDocument from './k5a-c5-extraction-corpus-v2.json'

const ACTOR = '10000000-0000-4000-8000-000000000001'
const MARA = '10000000-0000-4000-8000-000000000002'
const RECORDED_NON_NULL_CLAIM = '<recorded non-null claim>'

interface CorpusCase {
  id: string
  stratum: string
  eventType: string
  expectedClaim: string | null
  expectedKnowledgeType: 'domain' | 'operational' | 'preference' | null
  expectedAboutPersonId: string | null
}

const corpus = corpusDocument as { version: string; cases: CorpusCase[] }

// Controls that returned a non-null claim (receipt: arms 1b and 1b').
const controlsThatReturnedAClaim = new Set([
  // 1b hard-core false durables — the five gated failures.
  'v2-ctl-core-doc-03',
  'v2-ctl-core-slack-02',
  'v2-ctl-core-slack-03',
  'v2-ctl-core-jira-04',
  'v2-ctl-core-explicit-07',
  // 1b' rim — reported, not gated: 8 durable of 11.
  'v2-ctl-rim-doc-01',
  'v2-ctl-rim-doc-02',
  'v2-ctl-rim-doc-03',
  'v2-ctl-rim-slack-02',
  'v2-ctl-rim-slack-03',
  'v2-ctl-rim-jira-01',
  'v2-ctl-rim-jira-03',
  'v2-ctl-rim-explicit-02',
])

// Recorded actual knowledgeType where it differs from the case's default.
// Controls default to `domain`; positives default to their expected type.
const recordedTypeOverride: Record<string, 'domain' | 'operational'> = {
  'v2-ctl-core-slack-08': 'operational',
  'v2-ctl-core-explicit-01': 'operational',
  'v2-pos-dom-slack-03': 'operational', // the one 2c domain → operational error
}

// Recorded actual aboutPersonId where it differs from the case's expected
// value. Controls default to null; positives default to their expected value.
const recordedAboutOverride: Record<string, string | null> = {
  'v2-ctl-core-slack-02': MARA,
  'v2-ctl-core-slack-03': MARA,
  'v2-ctl-rim-explicit-02': ACTOR,
  'v2-pos-op-jira-03': null, // the one gated arm-3 attribution miss
}

const main = (): void => {
  const results = corpus.cases.map((testCase) => {
    const isPositive = testCase.expectedClaim !== null
    const claim = isPositive || controlsThatReturnedAClaim.has(testCase.id)
      ? RECORDED_NON_NULL_CLAIM
      : null
    const knowledgeType = recordedTypeOverride[testCase.id]
      ?? testCase.expectedKnowledgeType
      ?? 'domain'
    const aboutPersonId = testCase.id in recordedAboutOverride
      ? recordedAboutOverride[testCase.id]
      : isPositive
        ? testCase.expectedAboutPersonId
        : null
    return {
      id: testCase.id,
      stratum: testCase.stratum,
      eventType: testCase.eventType,
      expected: {
        claim: testCase.expectedClaim,
        knowledgeType: testCase.expectedKnowledgeType,
        aboutPersonId: testCase.expectedAboutPersonId,
      },
      actual: { claim, knowledgeType, aboutPersonId },
      // The 2026-08-03 run did not record per-case usage. Undefined is the
      // honest value: not known, as distinct from zero.
      usage: { inputTokens: undefined, outputTokens: undefined },
    }
  })

  console.log(JSON.stringify({
    corpusVersion: corpus.version,
    corpusPayloadSha256:
      '47f188f48fde5ad93df3e7a8bcd5de03108fc074f17d05b981e4edd8a665345a',
    measurementPair: {
      contractVersion: 'cartographer-single-claim-v5',
      modelProvider: 'openai',
      modelId: 'gpt-5.5',
    },
    cases: results.length,
    usageTotals: {
      inputTokens: 0,
      outputTokens: 0,
      inputReportedCases: 0,
      outputReportedCases: 0,
    },
    results,
  }, null, 2))
}

main()
