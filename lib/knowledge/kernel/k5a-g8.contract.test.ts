import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8')

const driver = read('recipes/cartographer-k5a-c3-local-proof.sh')
const probes = read('recipes/lib/cartographer-k5a-c3-run-probes.sh')
const measurement = [
  read('recipes/sql/cartographer-k5a-floor-measurement.sql'),
  read('recipes/sql/cartographer-k5a-floor-measurement-core.sql'),
  read('recipes/sql/cartographer-k5a-birth-zero-measurement.sql'),
].join('\n')
const receipt = read(
  'docs/testing/receipts/memory/k5a-birth-zero-measurement-2026-08-03.md',
)
const migration = read(
  'supabase/migrations/080_knowledge_search_findability_backfill.sql',
)
const searchStart = migration.indexOf(
  'CREATE FUNCTION public.search_knowledge_units',
)
const keywordStart = migration.indexOf(
  'CREATE FUNCTION public.keyword_search_units',
)
const semantic = migration.slice(searchStart, keywordStart)
const keyword = migration.slice(keywordStart)
const migrations = readdirSync(resolve(process.cwd(), 'supabase/migrations'))

describe('K5a G8 birth-zero measurement contract', () => {
  it('measures the inclusive-zero possibility without mutating the bench', () => {
    expect(measurement).toContain(
      'count(*) FILTER (WHERE attention_score = 0)',
    )
    expect(measurement).toContain('unit.embedding IS NOT NULL')
    expect(measurement).toContain('unit.knowledge_type IS NOT NULL')
    expect(measurement).toContain('unit.attention_score IS NOT NULL')
    expect(measurement).toContain('viewer_has_graph_node_grant')
    expect(measurement).toContain('K5A_BIRTH_ZERO_MEASUREMENT')
    expect(measurement).toContain(
      'CARTOGRAPHER_K5A_BIRTH_ZERO_MEASUREMENT_GREEN',
    )
    expect(driver).toContain('cartographer-k5a-c3-run-probes.sh')
    expect(probes).toContain('K5A_FLOOR_MEASUREMENT')
  })

  it('records zero today without declaring zero impossible', () => {
    expect(receipt).toContain('0 birth-zero units among 45,044')
    expect(receipt).toContain('curve | 1,600 | 0 | 1,600')
    expect(receipt).toContain('supported | 1,500 | 0 | 1,500')
    expect(receipt).toContain('foreign | 7,500 | 0 | 7,500')
    expect(receipt).toContain('does not make the class impossible')
    expect(receipt).toMatch(/worst read over the\s+\*\*whole authorized set\*\*/)
    expect(migrations.some((file) => file.startsWith('080_'))).toBe(true)
    expect(migrations.some((file) => file.startsWith('081_'))).toBe(true)
  })

  it('keeps 080 backfill-only and installs the coordinated G8 change atomically', () => {
    expect(migration).toContain('BEGIN;')
    expect(migration.trimEnd()).toMatch(/COMMIT;$/)
    expect(migration).toContain(
      "event.event_type IN ('conversation', 'message')",
    )
    for (const excluded of [
      "'document'", "'slack_message'", "'jira_update'", "'explicit'",
      'cartographer-single-claim-v5', 'topic_matcher_version',
    ]) expect(migration).not.toContain(excluded)
    expect(migration).toContain(
      'knowledge_extraction_coverage_backfill_markers',
    )
    expect(migration).toContain(
      'assert_knowledge_extraction_coverage_backfill_complete',
    )
    expect(migration).toContain('v_missing > v_limit')
    expect(migration).toContain('knowledge_extraction_coverage_backfill_over_limit')
    expect(migration).toContain('DROP INDEX IF EXISTS public.knowledge_units_audience_lookup')
    expect(migration).toContain('WHERE embedding IS NOT NULL AND knowledge_type IS NOT NULL')
    expect(migration).toContain('AND attention_score IS NOT NULL;')
  })

  it('searches every physics-complete authorized unit and leaves v3 unchanged', () => {
    expect(semantic).toContain('candidate.attention_score IS NOT NULL')
    expect(semantic).toContain('unit.attention_score IS NOT NULL')
    expect(keyword).toContain('unit.attention_score IS NOT NULL')
    expect(semantic).not.toContain('attention_score > 0')
    expect(keyword).not.toContain('attention_score > 0')
    expect(semantic).not.toContain('effective_attention > 0')
    expect(keyword).not.toContain('effective_attention > 0')
    expect(semantic).not.toContain('AND NOT EXISTS')
    expect(migration).not.toContain('retrieve_knowledge_graph_claims_v3')
  })

  it('carries a bounded G10 seam without changing the product result shape', () => {
    const schema = read('lib/supabase/schema/functions.ts')
    const product = read('lib/knowledge/unit-search.ts')
    expect(migration).toContain('viewer_retired boolean')
    expect(migration).toContain('knowledge_unit_viewer_retired(selected.unit_id')
    expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(schema).toContain('viewer_retired: boolean')
    expect(product).not.toContain('viewerRetired')
  })
})
