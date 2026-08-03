import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8')

const boundary = read('lib/knowledge/kernel/boundary.ts')
const boundaryMeasurement = read(
  'recipes/cartographer-k5a-floor-boundary.measurement.ts',
)
const databaseMeasurement = read(
  'recipes/sql/cartographer-k5a-floor-measurement.sql',
)
const databaseDriver = read('recipes/cartographer-k5a-c3-local-proof.sh')
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
    expect(boundary).toContain('K5A_BOUNDARY_TIMING === "1"')
    expect(boundary).toContain('performance.mark(BOUNDARY_TIMING_MARK')
    expect(boundary).not.toContain('observeTiming?:')
    expect(boundary).toContain('authMs = performance.now() - authStartedAt')
    expect(boundary).toContain(
      'clientAcquisitionMs = performance.now() - clientStartedAt',
    )
    expect(boundary).toContain(
      'transportMs = performance.now() - transportStartedAt',
    )
    expect(boundary).toContain('parseMs = performance.now() - parseStartedAt')
    expect(boundary).toContain('Diagnostics cannot change the retrieval result.')
  })

  it('keeps the proposal gated while measuring clean database and boundary paths', () => {
    expect(boundary).toContain('const RESPONSE_FLOOR_MS = 550')
    expect(databaseMeasurement).toContain('warm_no_explain_same_session')
    expect(databaseMeasurement).not.toContain('EXPLAIN (')
    expect(databaseMeasurement).not.toContain('p95_ms <= 550')
    expect(databaseMeasurement).toContain('existing_response_floor_ms')
    expect(databaseMeasurement).toContain('FOR i IN 1..5 LOOP')
    expect(databaseMeasurement).toContain('floor-foreign-pair-%s')
    expect(databaseMeasurement).toContain('k5a_floor_foreign_growth_mismatch')
    expect(databaseMeasurement).toContain('abs(before_growth_p95_ms')
    expect(databaseMeasurement).toContain(
      'CARTOGRAPHER_K5A_FLOOR_DATABASE_GREEN',
    )
    expect(databaseDriver).toContain('K5A_FLOOR_MEASUREMENT')
    expect(databaseDriver).toContain('node.name.text === "RESPONSE_FLOOR_MS"')
    expect(boundaryMeasurement).toContain('loopback_supabase_http_without_database_execution')
    expect(boundaryMeasurement).toContain('sample.floorWaitMs > 0')
    expect(proposal).toContain('FLOOR_PROPOSAL_AWAITING_CONFIRMATION')
    expect(proposal).toContain('still says 550 ms')
  })

  it('derives one floor and G5 threshold from the captured measurements', () => {
    expect(measurement.status).toBe('FLOOR_PROPOSAL_AWAITING_CONFIRMATION')
    expect(measurement.boundary.phase_overhead_p95_ms).toBe(3.256)
    expect(measurement.derivation.unrounded_floor_ms).toBe(555.095)
    expect(measurement.derivation.integer_ceiling_floor_ms).toBe(556)
    expect(measurement.proposal.response_floor_ms).toBe(556)
    expect(
      measurement.proposal.g5_exact_recall_through_authorized_units,
    ).toBe(1500)
    expect(
      measurement.proposal.first_measured_over_existing_floor_authorized_units,
    ).toBe(1600)
  })
})
