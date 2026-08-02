import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8')

const recipe = read('recipes/cartographer-k5a-c3-local-proof.sh')
const poc = read('recipes/sql/cartographer-k5a-c3-poc.sql')
const realistic = read('recipes/sql/cartographer-k5a-c3-realistic.sql')
const probe = read('recipes/sql/cartographer-k5a-c3-probe.sql')
const boundary = read('lib/knowledge/kernel/boundary.ts')
const migration = read('supabase/migrations/078_knowledge_unit_lifecycle.sql')
const annotationMigration = read('supabase/migrations/079_knowledge_unit_read.sql')
const lifecycleRecipe = read('recipes/cartographer-k5a-c1-c2-local-proof.sh')
const lifecycleAssertions = read(
  'recipes/sql/cartographer-k5a-c1-c2-assertions.sql',
)
const citationRecorder = read('lib/knowledge/lifecycle/citations.ts')
const promptComposer = read('lib/prompts/index.ts')
const graphTool = read('lib/retrieval/knowledge-retrieval-tools.ts')
const sessionDecay = read('lib/agents/cartographer/session-decay.ts')
const generatedFunctions = read('lib/supabase/schema/functions.ts')
const generatedTables = read('lib/supabase/schema/knowledge-tables.ts')
const fullSuite = read('recipes/full-suite.sh')
const receipt = read(
  'docs/testing/receipts/memory/k5a-c3-selecting-read-poc-2026-08-02.md',
)
const lifecycleReceipt = read(
  'docs/testing/receipts/memory/k5a-c1-c2-lifecycle-proof-2026-08-02.md',
)
const r6Receipt = read(
  'docs/testing/receipts/memory/k5a-r6-c3-r5-c4-local-proof-2026-08-03.md',
)

describe('K5a stage-one contract', () => {
  it('keeps the C3 proof disposable, stdin-only, and exit preserving', () => {
    expect(recipe).toContain('--network none')
    expect(recipe).toContain('--pull=never')
    expect(recipe).toContain('docker exec -i')
    expect(recipe).not.toMatch(/psql[\s\S]{0,120}\s-c\s/)
    expect(recipe).toContain('PIDS=()')
    expect(recipe).toContain('track_pid "$!"')
    expect(recipe).toContain('cleanup_status=$?')
    expect(recipe).toContain('CARTOGRAPHER_K5A_C3_LOCAL_GREEN')
  })

  it('walks before selecting and repairs only annotation-visible pairs', () => {
    const walk = poc.indexOf('v_frontier := ARRAY[v_root]')
    const candidates = poc.indexOf('INSERT INTO k5a_c3_candidates')
    const topK = poc.indexOf('INSERT INTO k5a_c3_selected')
    const annotations = poc.indexOf(
      'FROM public.knowledge_relation_annotation_index annotation',
    )
    const promotion = poc.indexOf(
      'INSERT INTO k5a_c3_selected(unit_id, selected_rank, promoted)',
      topK + 1,
    )
    expect(walk).toBeGreaterThan(-1)
    expect(walk).toBeLessThan(candidates)
    expect(candidates).toBeLessThan(topK)
    expect(topK).toBeLessThan(annotations)
    expect(annotations).toBeLessThan(promotion)
    expect(poc).toContain('assertion_person_id = p_viewer_profile_id')
    expect(poc).not.toMatch(/SET(?: LOCAL)? enable_/)
    expect(poc).toContain('ORDER BY annotation.repair_priority')
    expect(poc).toContain('Bound the own-person index seek before checking walk membership')
    expect(poc).toContain('p_per_claim_partner_cap')
    expect(poc).toContain('p_annotation_check_budget')
    expect(poc).toContain('p_closure_budget')
  })

  it('installs the R3 annotation projection with one transactional writer', () => {
    expect(annotationMigration.trimStart().startsWith('-- K5a stage 2')).toBe(true)
    expect(annotationMigration).toContain('BEGIN;')
    expect(annotationMigration.trimEnd().endsWith('COMMIT;')).toBe(true)
    expect(annotationMigration).toContain(
      'CREATE TABLE IF NOT EXISTS public.knowledge_relation_annotation_index',
    )
    expect(annotationMigration).toContain('knowledge_relation_annotation_own_lookup')
    expect(annotationMigration).toContain('endpoint_unit_id, assertion_person_id')
    expect(annotationMigration).toContain('AFTER INSERT ON public.knowledge_relation_assertions')
    expect(annotationMigration).toContain('knowledge_relation_annotation_backfill_incomplete')
    expect(annotationMigration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(annotationMigration).toContain('GRANT SELECT ON public.knowledge_relation_annotation_index')
    expect(annotationMigration).not.toContain(
      'GRANT INSERT ON public.knowledge_relation_annotation_index',
    )
    expect(generatedTables).toContain(
      'knowledge_relation_annotation_index: TableShape',
    )
  })

  it('records the amended empirical C3 battery and mechanism proof', () => {
    expect(poc).toContain('k5a_c3_atomic_top_k_failed')
    expect(poc).toContain('k5a_c3_suppressed_pair_signalled')
    expect(poc).toContain('k5a_c3_own_degree_overflow_failed')
    expect(poc).toContain('k5a_c3_r6_small_regime_failed')
    expect(poc).toContain('k5a_c3_supersedes_first_failed')
    expect(poc).toContain('k5a_c3_chain_middle_degradation_failed')
    expect(poc).toContain('k5a_c3_suppressed_pair_plan_failed')
    expect(poc).toContain('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)')
    expect(poc).toContain("v_mechanism_after->'node_types' ? 'Seq Scan'")
    expect(poc).toContain('v_p95_before >= v_response_floor_ms')
    expect(poc).toContain('small_relation_page_budget')
    expect(realistic).toContain('k5a_c3_r6_crossover_failed')
    expect(realistic).toContain('k5a_c3_r6_realistic_regime_failed')
    expect(realistic).toContain('knowledge_relation_annotation_own_lookup')
    expect(realistic).toContain("'rows_removed_by_filter'")
    expect(realistic).toContain("'rows_read'")
    expect(realistic).toContain('timing_envelope_3sigma_ms')
    expect(recipe).toContain('BOUNDARY_SOURCE=')
    expect(recipe).toContain('RESPONSE_FLOOR_MS="$(sed')
    expect(boundary).toMatch(/^const RESPONSE_FLOOR_MS = [0-9_]+;$/m)
    expect(poc).not.toContain('550')
    expect(realistic).not.toContain('550')
    expect(recipe).toContain('CARTOGRAPHER_K5A_C3_R6_SMALL_GREEN')
    expect(recipe).toContain('CARTOGRAPHER_K5A_C3_R6_REALISTIC_GREEN')
    expect(poc).toContain("channel IN ('reach', 'search')")
    expect(poc).toContain("session_distance BETWEEN 0 AND 5")
    expect(probe).toContain('K5A_C3_CONCURRENT_PROBE_GREEN')
    expect(fullSuite).toContain('./recipes/cartographer-k5a-c3-local-proof.sh')
    expect(receipt).toContain('CARTOGRAPHER_K5A_C3_LOCAL_GREEN')
    expect(receipt).toContain('Status: `superseded')
    expect(receipt).toContain('foreign assertion rows')
    expect(r6Receipt).toContain('Status: `C3_AND_C4_LOCAL_BATTERIES_GREEN`')
    expect(r6Receipt).toContain('CARTOGRAPHER_K5A_C3_LOCAL_GREEN')
    expect(r6Receipt).toContain('first measured state beyond')
    expect(r6Receipt).toMatch(/rows read did not change by\s+one/)
    expect(r6Receipt).toContain('g5_ann_threshold_units = null')
  })

  it('installs the lifecycle substrate transactionally and re-runs it', () => {
    expect(migration.trimStart().startsWith('-- K5a stage one')).toBe(true)
    expect(migration).toContain('BEGIN;')
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true)
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.knowledge_unit_citations')
    expect(migration).toContain("'cited', 'retired'")
    expect(migration).toContain("'standing', 'reach', 'search'")
    expect(migration).toContain('PRIMARY KEY (user_id, session_id)')
    expect(migration).toContain('SET started_at = session.created_at')
    expect(migration).toContain('knowledge_unit_citations_delivery_once')
    expect(migration).toContain('knowledge_unit_citations_viewer_session')
    expect(migration).toContain(
      'ON public.session_index(user_id, started_at DESC, session_id DESC)',
    )
    expect(migration).toContain('OFFSET 5 LIMIT 1')
    expect(migration).toContain('LIMIT 6')
    expect(migration).toContain('p_channel IS NULL')
    expect(migration).toContain('actor_profile_id IS NOT NULL')
    expect(migration).toContain("delivery_channel IN ('reach', 'search')")
    expect(migration).not.toContain('row_number() OVER')
    expect(migration).toContain('FROM PUBLIC, anon, authenticated')
    expect(migration).toContain('TO service_role')
    expect(lifecycleRecipe).toContain('for pass in 1 2')
    expect(lifecycleRecipe).toContain('CARTOGRAPHER_K5A_C1_C2_LOCAL_GREEN')
  })

  it('proves person isolation, immutable acts, and unit purity', () => {
    expect(lifecycleAssertions).toContain('k5a_channel_eligibility_or_person_isolation_failed')
    expect(lifecycleAssertions).toContain('k5a_viewer_session_distance_failed')
    expect(lifecycleAssertions).toContain('k5a_legacy_session_timestamp_not_normalized')
    expect(lifecycleAssertions).toContain('k5a_terminal_zero_divergence_not_named')
    expect(lifecycleAssertions).toContain('k5a_citation_window_failed')
    expect(lifecycleAssertions).toContain('generate_series(1, 8000)')
    expect(lifecycleAssertions).toContain('k5a_recent_window_plan_unbounded')
    expect(lifecycleAssertions).toContain('idx_session_index_user_started')
    expect(lifecycleAssertions).toContain('k5a_lifecycle_update_accepted')
    expect(lifecycleAssertions).toContain('k5a_null_citation_actor_accepted')
    expect(lifecycleAssertions).toContain('k5a_attention_or_citation_mutated_unit')
    expect(fullSuite).toContain('./recipes/cartographer-k5a-c1-c2-local-proof.sh')
    expect(lifecycleReceipt).toContain('CARTOGRAPHER_K5A_C1_C2_LOCAL_GREEN')
  })

  it('records standing and reach delivery before exposure with coherent types', () => {
    expect(citationRecorder).toContain("'record_knowledge_unit_citations'")
    expect(promptComposer).toContain('channel: "standing"')
    expect(promptComposer).toContain('standingCitationFailed')
    expect(promptComposer).toContain(
      '!withheldUnitIds.has(claim.knowledgeUnitId)',
    )
    expect(promptComposer).not.toContain('standingClaims.includes(claim)')
    expect(graphTool).toContain("channel: 'reach'")
    expect(graphTool).toContain("citation.outcome === 'failed'")
    expect(sessionDecay).not.toContain('upsertSessionIndex')
    expect(generatedFunctions).toContain('record_knowledge_unit_citations')
    expect(generatedFunctions).toContain('upsert_person_session_index')
    expect(generatedTables).toContain('knowledge_unit_citations: TableShape')
  })
})
