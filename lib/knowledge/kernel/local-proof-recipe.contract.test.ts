import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  renderAuthorityGapSetupSql,
} from './authority-boundary-sql'
import { renderAuthorityTargetPlanAssertionsSql } from './authority-plan-assertions-sql'
import { renderKnowledgeGraphSql } from './generate-sql'
import { createK1FixtureSeed } from './k1-fixture-seed'
import { renderK1HistoricalSetupSql } from './k1-historical-sql'
import { renderK1LegacySetupSql } from './k1-legacy-setup-sql'

const recipe = readFileSync(resolve(process.cwd(), 'recipes/knowledge-graph-local-proof.sh'), 'utf8')
const dockerBoundary = readFileSync(resolve(process.cwd(), 'recipes/lib/docker-proof.sh'), 'utf8')
const baselineCore = readFileSync(resolve(process.cwd(),
  'recipes/sql/installed-pre-054/core.sql'), 'utf8')
const precondition = [
  'recipes/sql/installed-pre-054-precondition/expectations.sql',
  'recipes/sql/installed-pre-054-precondition/catalog.sql',
  'recipes/sql/installed-pre-054-precondition/verdict.sql',
].map((path) => readFileSync(resolve(process.cwd(), path), 'utf8')).join('')
const seed = createK1FixtureSeed('local-proof-auth-contract')

const authUserInsertColumns = (sql: string): string[][] => Array.from(
  sql.matchAll(/INSERT INTO auth\.users\s*\(([^)]+)\)/g),
  (match) => match[1].split(',').map((column) => column.trim()),
)

describe('exact local graph candidate recipe', () => {
  it('uses one disposable no-network database and never pulls', () => {
    expect(recipe).toContain('pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee')
    expect(recipe).toContain('--pull=never')
    expect(recipe).toContain('--network none')
    expect(recipe).toContain('voyager-graph-local-$(date +%s)-$$')
    expect(recipe).toContain('docker_proof_cleanup "$CONTAINER_NAME"')
    expect(dockerBoundary).toContain('docker rm -f "$container_name"')
    expect(recipe).not.toContain('docker pull')
  })

  // The candidate is now the product, so the whole set 054-069 applies in one
  // order: legacy history, the migrations up to the additive substrate, the K1
  // historical fixture, then the cutover, its projections, the deployment gap
  // written BEFORE activation, activation, and the ingress that replaces the
  // old writer. That order is the release boundary; pin it.
  it('applies 054-069 in cutover order, with the deployment gap before activation', () => {
    for (const number of ['054', '055', '056', '057', '058', '059', '060', '061', '062',
      '063', '064', '065', '066', '067', '068', '069']) {
      expect(recipe).toContain(number)
    }
    const transaction = recipe.slice(recipe.indexOf("cat <<'SQL'\nBEGIN;"))
    const productLoop = 'for number in 054 055 056 057 058 059 060 061 062 063'
    const order = ['k1-legacy.sql', productLoop, 'k1-historical.sql', '064_', '065_',
      'gap.sql', '067_', '068_', '069_', 'generated.sql']
    for (let step = 1; step < order.length; step++) {
      expect(transaction.indexOf(order[step - 1]))
        .toBeLessThan(transaction.indexOf(order[step]))
    }
    expect(recipe).toContain('generate-sql.ts')
    expect(recipe).toContain('generate-k1-sql.ts')
  })

  it('seeds only the auth-user fields exposed by the local pre-054 fixture', () => {
    const allowedColumns = ['id', 'email', 'raw_user_meta_data', 'created_at']
    const sources = [
      renderK1LegacySetupSql(seed),
      renderK1HistoricalSetupSql(seed),
      renderKnowledgeGraphSql(),
      renderAuthorityGapSetupSql(seed),
      renderAuthorityTargetPlanAssertionsSql(),
    ]
    for (const sql of sources) {
      const inserts = authUserInsertColumns(sql)
      const insertCount = Array.from(sql.matchAll(/INSERT INTO auth\.users\b/g)).length
      expect(inserts.length).toBeGreaterThan(0)
      expect(inserts).toHaveLength(insertCount)
      expect(inserts.every((columns) => columns.join(',') === allowedColumns.join(','))).toBe(true)
    }
  })

  it('faithfully models the deployed retained voyage-membership identity', () => {
    expect(baselineCore)
      .toMatch(/CREATE TABLE public\.voyage_members[\s\S]*UNIQUE \(voyage_id, user_id\)/)
  })

  it('proves the installed spaces id default through PostgreSQL catalog evidence', () => {
    expect(baselineCore).toContain('id uuid PRIMARY KEY DEFAULT gen_random_uuid()')
    expect(precondition).toContain(
      'pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid)')
    expect(precondition).toContain('LEFT JOIN pg_catalog.pg_attrdef default_row')
    expect(precondition).toContain("IS DISTINCT FROM 'gen_random_uuid()'")
    expect(precondition).toContain('spaces_id_default')
  })

  it('fails closed and proves negative sequence neutrality', () => {
    expect(recipe).toContain('set -euo pipefail')
    expect(recipe).toContain('sequence_guard')
    expect(recipe).not.toContain('setval(')
    expect(recipe).toContain('KNOWLEDGE_GRAPH_LOCAL_GREEN')
  })
})
