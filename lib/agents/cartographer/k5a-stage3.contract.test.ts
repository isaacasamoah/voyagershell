import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8')

const boundary = read('lib/knowledge/kernel/boundary.ts')
const boundaryTiming = read('lib/knowledge/kernel/boundary-timing.ts')
const boundaryMeasurement = read(
  'recipes/cartographer-k5a-floor-boundary.measurement.ts',
)
const databaseMeasurement = [
  read('recipes/sql/cartographer-k5a-floor-measurement.sql'),
  read('recipes/sql/cartographer-k5a-floor-measurement-core.sql'),
  read('recipes/sql/cartographer-k5a-birth-zero-measurement.sql'),
].join('\n')
const databaseDriver = read('recipes/cartographer-k5a-c3-local-proof.sh')
const databaseProbes = read('recipes/lib/cartographer-k5a-c3-run-probes.sh')
const sourceContracts = read('recipes/lib/cartographer-k5a-read-contracts.sh')
const coverageMigration = read(
  'supabase/migrations/080_knowledge_search_findability_backfill.sql',
)
const cartographerContract = read('lib/agents/cartographer/contract.ts')
const v5ActivationMigration = read(
  'supabase/migrations/083_activate_v5_extractor_contract.sql',
)
const v6ActivationMigration = read(
  'supabase/migrations/084_activate_v6_context_contract.sql',
)
const c5Harness = read('recipes/experiments/k5a-c5-extraction-harness.ts')
const c5Structural = read(
  'recipes/sql/cartographer-k5a-c5-structural-falsifier.sql',
)
const c3V5Dynamics = read(
  'recipes/sql/cartographer-k5a-c3-v5-dynamics.sql',
)
const c5CorpusV2 = JSON.parse(read(
  'recipes/experiments/k5a-c5-extraction-corpus-v2.json',
)) as {
  version: string
  meta: { freeze: { payloadSha256: string } }
  cases: Array<{
    id: string
    eventType: string
    expectedClaim: string | null
    expectedKnowledgeType: string | null
  }>
}
const c5Receipt = read(
  'docs/testing/receipts/memory/k5a-c5-extraction-measurement-2026-08-03.md',
)
const v5ReadyReceipt = read(
  'docs/testing/receipts/memory/k5a-v5-ready-2026-08-03.md',
)
const v5ResultReceipt = read(
  'docs/testing/receipts/memory/k5a-c5-v5-one-shot-result-2026-08-03.md',
)
const migrationFiles = readdirSync(resolve(process.cwd(), 'supabase/migrations'))
const proposal = read(
  'docs/testing/receipts/memory/k5a-floor-proposal-2026-08-03.md',
)
const measurement = JSON.parse(read(
  'docs/testing/receipts/memory/k5a-floor-measurement-2026-08-03.json',
)) as {
  status: string
  boundary: { phase_overhead_p95_ms: number }
  derivation: {
    unrounded_floor_ms: number
    integer_ceiling_floor_ms: number
  }
  proposal: {
    response_floor_ms: number
    g5_exact_recall_through_authorized_units: number
    first_measured_over_existing_floor_authorized_units: number
  }
}

describe('K5a stage-three floor proposal contract', () => {
  it('instruments every observable boundary phase without changing retrieval', () => {
    expect(boundaryTiming).toContain('K5A_BOUNDARY_TIMING === \'1\'')
    expect(boundaryTiming).toContain('performance.mark(BOUNDARY_TIMING_MARK')
    expect(boundary).not.toContain('observeTiming?:')
    expect(boundary).toContain('authMs = performance.now() - authStartedAt')
    expect(boundary).toContain(
      'clientAcquisitionMs = performance.now() - clientStartedAt',
    )
    expect(boundary).toContain(
      'transportMs = performance.now() - transportStartedAt',
    )
    expect(boundary).toContain('parseMs = performance.now() - parseStartedAt')
    expect(boundaryTiming).toContain('Diagnostics cannot change the retrieval result.')
  })

  it('couples the confirmed floor to clean database and boundary measurements', () => {
    expect(boundary).toContain('const RESPONSE_FLOOR_MS = 556')
    expect(databaseMeasurement).toContain('warm_no_explain_same_session')
    expect(databaseMeasurement).not.toContain('EXPLAIN (')
    expect(databaseMeasurement).not.toContain('p95_ms <= 550')
    expect(databaseMeasurement).toContain('response_floor_ms')
    expect(databaseMeasurement).toContain('boundary_overhead_ms')
    expect(databaseMeasurement).toContain('g5_exact_units')
    expect(databaseMeasurement).toContain('v_database_budget_ms')
    expect(databaseMeasurement).toContain('FOR i IN 1..5 LOOP')
    expect(databaseMeasurement).toContain('floor-foreign-pair-%s')
    expect(databaseMeasurement).toContain('k5a_floor_foreign_growth_mismatch')
    expect(databaseMeasurement).toContain('abs(before_growth_p95_ms')
    expect(databaseMeasurement).toContain(
      'CARTOGRAPHER_K5A_FLOOR_DATABASE_GREEN',
    )
    expect(databaseDriver).toContain('cartographer-k5a-c3-run-probes.sh')
    expect(databaseProbes).toContain('K5A_FLOOR_MEASUREMENT')
    expect(sourceContracts).toContain('node.name.text === "RESPONSE_FLOOR_MS"')
    expect(sourceContracts).toContain('phase_overhead_p95_ms')
    expect(boundaryMeasurement).toContain('loopback_supabase_http_without_database_execution')
    expect(boundaryMeasurement).toContain('sample.floorWaitMs > 0')
    expect(proposal).toContain('FLOOR_CONFIRMED_G8_MEASURED')
    expect(proposal).toContain('now carries\n556 ms')
  })

  it('derives one floor and G5 threshold from the captured measurements', () => {
    expect(measurement.status).toBe('FLOOR_CONFIRMED_G8_MEASURED')
    expect(measurement.boundary.phase_overhead_p95_ms).toBe(3.256)
    expect(measurement.derivation.unrounded_floor_ms).toBe(555.095)
    expect(measurement.derivation.integer_ceiling_floor_ms).toBe(556)
    expect(measurement.proposal.response_floor_ms).toBe(556)
    expect(
      measurement.proposal.g5_exact_recall_through_authorized_units,
    ).toBe(1400)
    expect(
      measurement.proposal.first_measured_over_existing_floor_authorized_units,
    ).toBe(1500)
  })
})

describe('K5a C5 extraction gate contract', () => {
  it('seals the measured v2 payload to every measured contract pair', () => {
    expect(c5CorpusV2.version).toBe('k5a-c5-labelled-v2')
    expect(c5CorpusV2.cases).toHaveLength(81)
    expect(new Set(c5CorpusV2.cases.map(({ id }) => id)).size).toBe(81)
    expect(new Set(c5CorpusV2.cases.map(({ eventType }) => eventType))).toEqual(
      new Set(['document', 'slack_message', 'jira_update', 'explicit']),
    )
    // The selectable-contract instrument came from #108 and is preserved: the
    // same sealed corpus can still be run against more than one contract, with
    // the same argv / K5A_C5_MEASURED_CONTRACTS entry points, the same
    // validation errors, and the same v5 default.
    expect(c5Harness).toContain('const measurableExtractorVersions = [\n'
      + '  CARTOGRAPHER_EXTRACTOR_VERSION,\n'
      + '  V4_MEASURED_EXTRACTOR_VERSION,\n'
      + '  V5_MEASURED_EXTRACTOR_VERSION,\n'
      + '] as const')
    expect(c5Harness).toContain('k5a_c5_contract_not_measurable')
    expect(c5Harness).toContain('k5a_c5_duplicate_contract_selected')
    expect(c5Harness).toContain('process.env.K5A_C5_MEASURED_CONTRACTS')
    expect(c5Harness).toContain('contractVersion: measuredExtractorVersion')
    // The default must not drift onto whatever contract is current, or the bare
    // command silently measures a different arm after every promotion.
    expect(c5Harness).toContain('?? V5_MEASURED_EXTRACTOR_VERSION)')
    expect(c5Harness).toContain(
      "V5_MEASURED_EXTRACTOR_VERSION = 'cartographer-single-claim-v5'",
    )
    // What changed from #108: v5 stopped being a candidate when it became the
    // runtime contract, so its side door was deleted. Every arm now selects by
    // extractorVersion and runs the live path. Assert the side door cannot
    // return, otherwise the deletion is a comment rather than a guarantee.
    expect(c5Harness).toContain("import { extractKnowledge }")
    expect(c5Harness).toContain('await extractKnowledge(model, attempt)')
    expect(c5Harness).not.toContain('await extractV5CandidateKnowledge(')
    expect(cartographerContract).not.toContain(
      'CARTOGRAPHER_CANDIDATE_EXTRACTOR_VERSION',
    )
    expect(c5Harness).toContain('modelProvider: measuredModelProvider')
    expect(c5Harness).toContain('modelId: connectedCodexModelName')
    expect(c5Harness).not.toContain('sourceAudienceId === attemptAudienceId')
    expect(c5Harness).not.toContain('audienceInheritance')
    expect(c5Harness).not.toContain('knowledge_extraction_jobs')
    expect(c5CorpusV2.meta.freeze.payloadSha256).toBe(
      '47f188f48fde5ad93df3e7a8bcd5de03108fc074f17d05b981e4edd8a665345a',
    )
    expect(c5Harness).toContain(
      'observedPayloadSha256 !== expectedPayloadSha256',
    )
  })

  it('keeps the v4 evidence and its uncredited audience arm explicit', () => {
    expect(c5Receipt).toContain('K5A-C5-BLOCKED-PENDING-SPEC')
    expect(c5Receipt).toContain('22 / 24')
    expect(c5Receipt).toContain('16 / 20')
    expect(c5Receipt).toContain('Audience inheritance | not credited')
    expect(c5Receipt).toContain('no `080` file was authored')
    expect(c5Harness).not.toMatch(/precision|recall|acceptance.*(?:0\.|1\.0)/)
  })

  it('completes v5 once while preserving the v4 prompt identity', () => {
    expect(cartographerContract).toContain(
      "CARTOGRAPHER_EXTRACTOR_VERSION = 'cartographer-single-claim-v6'",
    )
    expect(cartographerContract).toContain("'cartographer-single-claim-v5'")
    expect(cartographerContract).toContain(
      "'cartographer-single-claim-v4'",
    )
    expect(cartographerContract).toContain(
      'export const V4_CARTOGRAPHER_PROMPT = HISTORICAL_CARTOGRAPHER_PROMPT',
    )
    expect(cartographerContract).toContain('asserts the absence of a settled fact')
    expect(cartographerContract).toContain('ordered procedure; first match')
    expect(cartographerContract).toContain('wins:')
    expect(cartographerContract).toContain('classify what the claim asserts')
    expect(v5ReadyReceipt).toContain(
      'K5A-V5-RESULT-FAIL',
    )
    expect(v5ReadyReceipt).toContain('Any post-run label change invalidates')
    expect(v5ResultReceipt.match(/^\| `v2-/gm)).toHaveLength(81)
    expect(v5ResultReceipt).toContain(
      '47f188f48fde5ad93df3e7a8bcd5de03108fc074f17d05b981e4edd8a665345a',
    )
    expect(v5ResultReceipt).toContain(
      '`cartographer-single-claim-v5 × openai/gpt-5.5`',
    )
    expect(v5ResultReceipt).toContain('5/30 false durable')
    expect(v5ResultReceipt).toContain('39/40')
    expect(v5ResultReceipt).toContain('C5 fails and returns to Spec')
  })

  it('promotes v5 as harm reduction without claiming it passed', () => {
    // The promotion must never read as acceptance. A future reader who finds
    // the activation migration has to meet the FAIL verdict in the same breath,
    // or they will assume v5 cleared its bars because it shipped.
    expect(v5ActivationMigration).toContain('K5A-V5-RESULT-FAIL')
    expect(v5ActivationMigration).toContain('NOT acceptance')
    expect(v5ActivationMigration).toContain('Best available, still below bar')
    // Activation is an UPDATE of the one singleton row, never a second insert.
    expect(v5ActivationMigration).toContain(
      'UPDATE public.knowledge_extractor_contract_active',
    )
    expect(v5ActivationMigration).not.toMatch(
      /INSERT INTO public\.knowledge_extractor_contract_active/,
    )
    // Every version-pinned guard widens before the pointer moves.
    const widened = v5ActivationMigration.indexOf(
      'CHECK (extractor_version IN',
    )
    const activated = v5ActivationMigration.indexOf(
      'SET extractor_version = \'cartographer-single-claim-v5\'',
    )
    expect(widened).toBeGreaterThan(-1)
    expect(activated).toBeGreaterThan(widened)
    // v4 stays intact as a contract row; its units keep their attribution.
    expect(v5ActivationMigration).toContain("'cartographer-single-claim-v4'")
    expect(v5ActivationMigration).not.toMatch(
      /DELETE FROM public\.knowledge_extractor_contracts/,
    )
  })

  it('ships v6 without letting it inherit v5 credibility', () => {
    // v6 carries v5's classification text but none of v5's measurement. If that
    // is not stated where the contract is registered, the next reader will
    // assume v6 was measured because v5 was.
    expect(v6ActivationMigration).toContain('UNMEASURED AGAINST THE C5 CORPUS')
    expect(v6ActivationMigration).toContain('K5A-V5-RESULT-FAIL')
    // The deletion and the addition must ship together or the context is a
    // silent no-op.
    expect(v6ActivationMigration).toContain('Do not infer a claim from prior knowledge')
    expect(v6ActivationMigration).toContain('Session context')
    // v5 stays registered so the A/B receipt keeps pointing at a live row and
    // a revert lands on v5, not v4.
    expect(v6ActivationMigration).toContain("'cartographer-single-claim-v5'")
    expect(v6ActivationMigration).not.toMatch(
      /DELETE FROM public\.knowledge_extractor_contracts/,
    )
  })

  it('preserves C5 spent evidence and priced costs', () => {
    expect(migrationFiles.some((file) => file.startsWith('080_'))).toBe(true)
    expect(coverageMigration).toContain(
      "event.event_type IN ('conversation', 'message')",
    )
    expect(coverageMigration).not.toContain('cartographer-single-claim-v5')
    expect(coverageMigration).not.toContain("'document'")
    expect(coverageMigration).not.toContain("'slack_message'")
    expect(coverageMigration).not.toContain("'jira_update'")
    expect(coverageMigration).not.toContain("'explicit'")
    expect(v5ReadyReceipt).toContain('topic-retrieval-v4')
    expect(v5ReadyReceipt).toContain('topic similarity threshold `0.2`')
    expect(v5ReadyReceipt).toContain('topic candidate limit `8`')
    expect(v5ReadyReceipt).toContain('admits v4 and v5')
    expect(v5ReadyReceipt).toContain('Activation is an `UPDATE`')
    expect(v5ReadyReceipt).toContain('Migration 081 remains untouched')
    expect(cartographerContract).toContain('K5A-V5-RESULT-FAIL')
  })

  it('makes audience inheritance and recoverable type dynamics falsifiable', () => {
    for (const relation of [
      'knowledge_extraction_jobs',
      'knowledge_extraction_attempts',
      'knowledge_extraction_attempt_outcomes',
      'knowledge_units',
      'graph_node_grants',
    ]) {
      expect(c5Structural).toContain(relation)
    }
    expect(c5Structural).toContain(
      'job.knowledge_audience_id = event.knowledge_audience_id',
    )
    expect(c5Structural).toContain(
      'unit_grant.knowledge_audience_id = event.knowledge_audience_id',
    )
    expect(c5Structural).toContain('k5a_c5_voyager_response_enqueued')
    expect(c5Structural).toContain('CARTOGRAPHER_K5A_C5_STRUCTURAL_GREEN')
    expect(databaseDriver).toContain(
      'cartographer-k5a-c5-structural-falsifier.sql',
    )
    expect(c3V5Dynamics).toContain("0.60, 'operational'")
    expect(c3V5Dynamics).toContain("0.90, 'domain'")
    expect(c3V5Dynamics).toContain('CARTOGRAPHER_K5A_C3_V5_DYNAMICS_GREEN')
  })
})
