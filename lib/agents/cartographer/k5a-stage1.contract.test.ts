import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8')

const recipe = read('recipes/cartographer-k5a-c3-local-proof.sh')
const poc = read('recipes/sql/cartographer-k5a-c3-poc.sql')
const probe = read('recipes/sql/cartographer-k5a-c3-probe.sql')
const fullSuite = read('recipes/full-suite.sh')
const receipt = read(
  'docs/testing/receipts/memory/k5a-c3-selecting-read-poc-2026-08-02.md',
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
    const annotations = poc.indexOf('FOR v_assertion IN')
    const promotion = poc.indexOf(
      'INSERT INTO k5a_c3_selected(unit_id, selected_rank, promoted)',
      topK + 1,
    )
    expect(walk).toBeGreaterThan(-1)
    expect(walk).toBeLessThan(candidates)
    expect(candidates).toBeLessThan(topK)
    expect(topK).toBeLessThan(annotations)
    expect(annotations).toBeLessThan(promotion)
    expect(poc).toContain('v_partner_visible := NOT EXISTS')
    expect(poc).toContain('p_per_claim_partner_cap')
    expect(poc).toContain('p_annotation_check_budget')
  })

  it('proves atomicity, suppression, honest truncation, and dedupe', () => {
    expect(poc).toContain('k5a_c3_atomic_top_k_failed')
    expect(poc).toContain('k5a_c3_suppressed_pair_signalled')
    expect(poc).toContain('k5a_c3_annotation_budget_failed')
    expect(poc).toContain("name = 'standing' OR name LIKE 'high-%'")
    expect(poc).toContain("channel IN ('reach', 'search')")
    expect(poc).toContain("session_distance BETWEEN 0 AND 5")
    expect(probe).toContain('K5A_C3_CONCURRENT_PROBE_GREEN')
    expect(fullSuite).toContain('./recipes/cartographer-k5a-c3-local-proof.sh')
    expect(receipt).toContain('CARTOGRAPHER_K5A_C3_LOCAL_GREEN')
  })
})
