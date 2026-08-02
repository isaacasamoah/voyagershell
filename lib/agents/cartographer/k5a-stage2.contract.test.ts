import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8')

const migration = read('supabase/migrations/079_knowledge_unit_read.sql')
const vectorMigration = read('supabase/migrations/076_topic_identity_hardening.sql')
const battery = read('recipes/sql/cartographer-k5a-c3-poc.sql')
const realisticBattery = read('recipes/sql/cartographer-k5a-c3-realistic.sql')
const c4R4Battery = read('recipes/sql/cartographer-k5a-c4-r4-assertions.sql')
const concurrentProbe = read('recipes/sql/cartographer-k5a-c3-probe.sql')
const boundary = read('lib/knowledge/kernel/boundary.ts')
const search = read('lib/knowledge/unit-search.ts')
const searchTools = read('lib/retrieval/unit-search-tools.ts')
const temporalTool = read('lib/retrieval/temporal-retrieval-tool.ts')
const functions = read('lib/supabase/schema/functions.ts')

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

  it('drives the production function through the C3 mechanism battery', () => {
    expect(battery.match(/public\.retrieve_knowledge_graph_claims_v3\(/g))
      .not.toBeNull()
    expect(battery.match(/public\.retrieve_knowledge_graph_claims_v3\(/g)!.length)
      .toBeGreaterThan(8)
    expect(battery).toContain('k5a_c3_exclude_unit_dedupe_failed')
    expect(battery).toContain('k5a_c3_atomic_top_k_failed')
    expect(realisticBattery).toContain('k5a_c3_r6_realistic_regime_failed')
    expect(battery).toContain('k5a_c3_own_degree_overflow_failed')
    expect(battery).toContain('k5a_c3_chain_middle_degradation_failed')
    expect(battery).not.toMatch(/SET(?: LOCAL)? enable_/)
    expect(realisticBattery).not.toMatch(/SET(?: LOCAL)? enable_/)
    expect(battery).toContain("k5a_c3_assert_behavior_poc('small')")
    expect(realisticBattery).toContain("k5a_c3_assert_behavior_poc('realistic')")
    expect(realisticBattery).toContain('k5a_c3_r6_crossover_failed')
    expect(realisticBattery).toContain("? 'knowledge_relation_annotation_own_lookup'")
    expect(realisticBattery).toContain("v_mechanism_before->'rows_read'")
    expect(realisticBattery).toContain('timing_envelope_3sigma_ms')
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
    expect(c4R4Battery).toContain('k5a_c4_exact_recall_failed')
    expect(c4R4Battery).toContain('k5a_c4_r5_plan_mechanism_failed')
    expect(c4R4Battery).toContain('k5a_c4_r5_foreign_corpus_changed')
    expect(c4R4Battery).toContain('unit_rows_read')
    expect(c4R4Battery).toContain('timing_envelope_3sigma_ms')
    expect(c4R4Battery).toContain("'g5_ann_threshold_units', NULL")
    expect(c4R4Battery).not.toContain('derived_ann_threshold_units')
    expect(c4R4Battery).not.toMatch(
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
