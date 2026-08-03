import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8')

const migration = read('supabase/migrations/079_knowledge_unit_read.sql')
const relationMigration = read('supabase/migrations/077_relation_conflict_ledger.sql')
const vectorMigration = read('supabase/migrations/076_topic_identity_hardening.sql')
const battery = read('recipes/sql/cartographer-k5a-c3-poc.sql')
const shapeBattery = read('recipes/sql/cartographer-k5a-c3-r7-shapes.sql')
const realisticBattery = read('recipes/sql/cartographer-k5a-c3-realistic.sql')
const c4R5Battery = [
  'measure', 'plan', 'battery',
].map((part) => read(`recipes/sql/cartographer-k5a-c4-r5-${part}.sql`)).join('\n')
const concurrentProbe = read('recipes/sql/cartographer-k5a-c3-probe.sql')
const c3Recipe = read('recipes/cartographer-k5a-c3-local-proof.sh')
const c3Contracts = read('recipes/lib/cartographer-k5a-read-contracts.sh')
const boundary = read('lib/knowledge/kernel/boundary.ts')
const search = read('lib/knowledge/unit-search.ts')
const searchTools = read('lib/retrieval/unit-search-tools.ts')
const temporalTool = read('lib/retrieval/temporal-retrieval-tool.ts')
const functions = read('lib/supabase/schema/functions.ts')
const r7Receipt = read(
  'docs/testing/receipts/memory/k5a-r7-battery-corrections-2026-08-03.md',
)

describe('K5a stage-two contract', () => {
  it('installs the production walk-select-annotate-repair read', () => {
    const walk = migration.indexOf('v_frontier := ARRAY[v_root]')
    const select = migration.indexOf('INSERT INTO k5a_read_candidates')
    const annotate = migration.indexOf(
      'FROM public.knowledge_relation_annotation_index annotation',
      select,
    )
    const repair = migration.indexOf(
      'INSERT INTO k5a_read_selected(unit_id, selected_rank, promoted)',
      annotate,
    )
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.retrieve_knowledge_graph_claims_v3',
    )
    expect(walk).toBeGreaterThan(-1)
    expect(walk).toBeLessThan(select)
    expect(select).toBeLessThan(annotate)
    expect(annotate).toBeLessThan(repair)
    expect(migration).toContain(
      'annotation.assertion_person_id = p_viewer_profile_id',
    )
    expect(migration).not.toMatch(/SET enable_(seqscan|bitmapscan|sort)\s*=/)
    expect(migration).toContain('public.knowledge_unit_effective_attention(')
    expect(migration).toContain("'tensions'")
    expect(migration).not.toMatch(/model_provider|provider_call/i)
  })

  it('drives production v3 through observable and design-integrity batteries', () => {
    expect(battery.match(/public\.retrieve_knowledge_graph_claims_v3\(/g))
      .not.toBeNull()
    expect(battery.match(/public\.retrieve_knowledge_graph_claims_v3\(/g)!.length)
      .toBeGreaterThan(8)
    expect(battery).toContain('k5a_c3_exclude_unit_dedupe_failed')
    expect(battery).toContain('k5a_c3_atomic_top_k_failed')
    expect(realisticBattery).toContain(
      'k5a_c3_r7_realistic_observable_or_integrity_failed',
    )
    expect(battery).toContain('k5a_c3_own_degree_overflow_failed')
    expect(battery).toContain('k5a_c3_chain_middle_degradation_failed')
    expect(battery).not.toMatch(/SET(?: LOCAL)? enable_/)
    expect(realisticBattery).not.toMatch(/SET(?: LOCAL)? enable_/)
    expect(battery).toContain("k5a_c3_assert_behavior_poc('small')")
    expect(realisticBattery).toContain("k5a_c3_assert_behavior_poc('realistic')")
    expect(shapeBattery).toContain('k5a_c3_r7_pointwise_disjunction_failed')
    expect(shapeBattery).toContain("'own-degree-cap'")
    expect(shapeBattery).toContain("'production-width'")
    expect(shapeBattery).toContain("'non-all-visible'")
    expect(shapeBattery).toContain("'combined-worst'")
    expect(shapeBattery).toContain('derived_page_budget')
    expect(shapeBattery).toContain('first_index_pages')
    expect(shapeBattery).toContain('heap_fetches_or_blocks')
    expect(shapeBattery).toContain('rows_removed_by_filter')
    expect(shapeBattery).not.toContain('source_caps_changed')
    expect(c3Contracts).toContain('ts.createSourceFile(')
    expect(c3Contracts).toContain('value.name.text === "perClaimPartnerCap"')
    expect(c3Recipe).toContain('run_interruptible docker run')
    expect(c3Recipe).not.toContain('run_interruptible docker_proof_run')
    expect(c3Recipe).toContain('run_interruptible docker exec')
    expect(relationMigration).toContain(
      'v_input_ids := ARRAY[v_attempt.unit_id] || v_attempt.candidate_unit_ids',
    )
    expect(realisticBattery).toContain(
      "v_design_integrity_before->'rows_read'",
    )
    expect(realisticBattery).toContain(
      'database_timing_diagnostic_3sigma_ms',
    )
    expect(realisticBattery).toContain(
      "'covered_by_source_coupled_floor_arm'",
    )
    expect(r7Receipt).toContain(
      'Status: `R7_BATTERY_CORRECTIONS_LOCAL_GREEN`',
    )
    expect(r7Receipt).toContain(
      'observable-boundary timing arm is deliberately absent',
    )
    expect(r7Receipt).toContain('combined-worst')
    expect(concurrentProbe).toContain(
      'public.retrieve_knowledge_graph_claims_v3(',
    )
  })

  it('installs unit vector, keyword, anchored, time, and exact-id reads', () => {
    const semanticStart = migration.indexOf(
      'CREATE OR REPLACE FUNCTION public.search_knowledge_units',
    )
    const semanticEnd = migration.indexOf(
      'CREATE OR REPLACE FUNCTION public.keyword_search_units', semanticStart,
    )
    const semanticRead = migration.slice(semanticStart, semanticEnd)
    const membership = semanticRead.indexOf(
      'WITH viewer_audiences AS MATERIALIZED',
    )
    const authorized = semanticRead.indexOf(
      'authorized AS MATERIALIZED', membership,
    )
    const grantBound = semanticRead.indexOf(
      "canonical_graph_node_id('knowledge_unit', candidate.id)",
      membership,
    )
    const exactDistance = semanticRead.indexOf(
      'unit.embedding <=> p_query_embedding', authorized,
    )
    expect(migration).toContain('claim_search_vector tsvector')
    expect(migration).toContain('GENERATED ALWAYS AS')
    expect(vectorMigration).toContain('knowledge_units_embedding_hnsw')
    expect(migration).toContain(
      'knowledge_audiences_member_profile_ids_lookup',
    )
    expect(migration).toContain('knowledge_units_audience_lookup')
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.search_knowledge_units',
    )
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.keyword_search_units',
    )
    expect(migration).toContain('public.traverse_knowledge_graph(')
    expect(membership).toBeGreaterThan(-1)
    expect(authorized).toBeGreaterThan(membership)
    expect(grantBound).toBeGreaterThan(membership)
    expect(grantBound).toBeLessThan(authorized)
    expect(exactDistance).toBeGreaterThan(authorized)
    expect(semanticRead).not.toMatch(
      /knowledge_units_embedding_hnsw|enable_seqscan|enable_bitmapscan|enable_sort|ef_search|iterative_scan/,
    )
    expect(migration).not.toMatch(/authorize_knowledge_scope|knowledge_in_scope/)
    expect(battery).toContain('k5a_c4_victim_seat_failed')
    expect(battery).toContain("IS DISTINCT FROM '[]'::jsonb")
    expect(c4R5Battery).toContain('k5a_c4_exact_recall_failed')
    expect(c4R5Battery).toContain(
      'v_curve_probe_units constant integer := 1400',
    )
    expect(c4R5Battery).toContain(
      'k5a_c4_r5_plan_design_integrity_failed',
    )
    expect(c4R5Battery).toContain('k5a_c4_r5_foreign_corpus_changed')
    expect(c4R5Battery).toContain('unit_rows_read')
    expect(c4R5Battery).toContain(
      'database_timing_diagnostic_3sigma_ms',
    )
    expect(c4R5Battery).toContain(
      "'covered_by_source_coupled_floor_arm'",
    )
    expect(c4R5Battery).toContain(
      "'g5_ann_threshold_units', v_curve_probe_units",
    )
    expect(c4R5Battery).not.toContain('derived_ann_threshold_units')
    expect(c4R5Battery).not.toMatch(
      /SET LOCAL (enable_|hnsw\.)|SET (enable_|hnsw\.)/,
    )
    expect(functions).toContain('search_knowledge_units:')
    expect(functions).toContain('keyword_search_units:')
  })

  it('repoints all five memory tools and records search before exposure', () => {
    expect(search).toContain("'search_knowledge_units'")
    expect(search).toContain("'keyword_search_units'")
    for (const toolName of [
      'semantic_search', 'keyword_grep', 'anchored_search', 'get_nodes',
    ]) expect(searchTools).toContain(`${toolName}: tool(`)
    expect(temporalTool).toContain('temporalUnitSearch(')
    expect(searchTools).toContain("channel: 'search'")
    expect(temporalTool).toContain("channel: 'search'")
    expect(searchTools.indexOf('await recorder({')).toBeLessThan(
      searchTools.indexOf('formatHits(result, empty, includeSourceContent)',
        searchTools.indexOf('await recorder({')),
    )
  })

  it('preserves the five-outcome application envelope on v3', () => {
    expect(boundary).toContain('retrieve_knowledge_graph_claims_v3')
    for (const outcome of [
      'success', 'invalid_request', 'deadline_exceeded', 'rpc_error', 'exception',
    ]) expect(boundary).toContain(`"${outcome}"`)
    expect(boundary).toContain('excludeUnitIds')
    expect(boundary).toContain('tensions')
  })
})
