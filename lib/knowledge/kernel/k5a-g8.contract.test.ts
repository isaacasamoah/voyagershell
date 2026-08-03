import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8')

const driver = read('recipes/cartographer-k5a-c3-local-proof.sh')
const measurement = read('recipes/sql/cartographer-k5a-floor-measurement.sql')
const receipt = read(
  'docs/testing/receipts/memory/k5a-birth-zero-measurement-2026-08-03.md',
)
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
    expect(driver).toContain('K5A_FLOOR_MEASUREMENT')
  })

  it('records zero today without declaring zero impossible', () => {
    expect(receipt).toContain('0 birth-zero units among 45,044')
    expect(receipt).toContain('curve | 1,600 | 0 | 1,600')
    expect(receipt).toContain('supported | 1,500 | 0 | 1,500')
    expect(receipt).toContain('foreign | 7,500 | 0 | 7,500')
    expect(receipt).toContain('does not make the class impossible')
    expect(receipt).toMatch(/worst read over the\s+\*\*whole authorized set\*\*/)
    expect(migrations.some((file) => file.startsWith('080_'))).toBe(false)
    expect(migrations.some((file) => file.startsWith('081_'))).toBe(false)
  })
})
