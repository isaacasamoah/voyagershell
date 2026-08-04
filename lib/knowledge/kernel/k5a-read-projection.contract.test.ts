import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// 079 named ten INSERT targets and fed the candidate table nine expressions.
// A plpgsql body is not planned at CREATE time, so the chain applied clean from
// zero, 506 tests passed, and the read raised 42601 on its first real call. The
// arity of that projection is the invariant those gates were missing.
const MIGRATIONS = 'supabase/migrations'
const INSERT_HEAD = 'INSERT INTO k5a_read_candidates('
const DEFINITION = 'CREATE OR REPLACE FUNCTION public.retrieve_knowledge_graph_claims_v3('

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')

const splitTopLevel = (list: string): string[] => {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const character of list) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (character === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

/** The INSERT target list and the expressions the outer SELECT actually feeds it. */
const readProjection = (sql: string): { targets: string[]; expressions: string[] } => {
  const insertAt = sql.indexOf(INSERT_HEAD)
  const targetsEnd = sql.indexOf(')', insertAt)
  const feedEnd = sql.indexOf('FROM scored', insertAt)
  const feed = sql.slice(insertAt, feedEnd)
  const selectAt = feed.lastIndexOf('\n  SELECT ')
  return {
    targets: splitTopLevel(sql.slice(insertAt + INSERT_HEAD.length, targetsEnd)),
    expressions: splitTopLevel(feed.slice(selectAt + '\n  SELECT '.length)),
  }
}

const migrationsDefiningTheRead = (): string[] => readdirSync(
  resolve(process.cwd(), MIGRATIONS),
).filter((name) => name.endsWith('.sql'))
  .filter((name) => read(`${MIGRATIONS}/${name}`).includes(DEFINITION))
  .sort()

describe('K5a graph claim read projection', () => {
  it('feeds the candidate table exactly the columns the effective read names', () => {
    const defining = migrationsDefiningTheRead()
    expect(defining.length).toBeGreaterThan(0)
    const effective = defining[defining.length - 1]
    const { targets, expressions } = readProjection(read(`${MIGRATIONS}/${effective}`))
    expect(targets).toHaveLength(expressions.length)
    targets.forEach((target, index) => {
      const projected = /^scored\.(\w+)$/.exec(expressions[index])
      if (projected) expect(projected[1]).toBe(target)
    })
    expect(targets).toContain('source_session_id')
    expect(expressions).toContain('scored.source_session_id')
  })

  // 079 is applied and ledgered on every database that has it, so the repair
  // ships forward as 082 rather than as an edit. Editing 079 in place would
  // never reach an already-migrated database while silently diverging history.
  it('leaves the sealed 079 body untouched and repairs it forward', () => {
    const sealed = readProjection(read(`${MIGRATIONS}/079_knowledge_unit_read.sql`))
    expect(sealed.targets).toHaveLength(10)
    expect(sealed.expressions).toHaveLength(9)
    const defining = migrationsDefiningTheRead()
    expect(defining[defining.length - 1]).not.toBe('079_knowledge_unit_read.sql')
  })

  // Only execution proves this read works, so the docker recipe must keep
  // applying the repair and asserting the session id survives the round trip.
  it('keeps the executing proof wired to the repair', () => {
    const recipe = read('recipes/cartographer-k5a-c3-local-proof.sh')
    const probes = read('recipes/lib/cartographer-k5a-c3-run-probes.sh')
    const assertions = read('recipes/sql/cartographer-k5a-082-session-repair.sql')
    expect(recipe).toContain('082_knowledge_unit_read_session_repair.sql')
    expect(recipe).toContain('CARTOGRAPHER_K5A_082_IDEMPOTENT_GREEN')
    expect(probes).toContain('cartographer-k5a-082-session-repair.sql')
    expect(probes).toContain('CARTOGRAPHER_K5A_082_SESSION_REPAIR_GREEN')
    expect(assertions).toContain('public.retrieve_knowledge_graph_claims_v3(')
    expect(assertions).toContain('k5a_082_session_id_not_projected')
  })

  // The recipe reads its budget from boundary.ts by matching a callee name in
  // the TypeScript AST. Renaming that helper does not fail a type check or a
  // test — it silently aborts the proof before a single migration is applied,
  // which is how the executing gate stopped running once already.
  it('keeps the recipe budget parser matched to the kernel it reads', () => {
    const contracts = read('recipes/lib/cartographer-k5a-read-contracts.sh')
    const boundary = read('lib/knowledge/kernel/boundary.ts')
    const callee = /node\.expression\.text === "(\w+)"/.exec(contracts)
    expect(callee).not.toBeNull()
    expect(boundary).toContain(`${callee![1]}(`)
    expect(boundary).toContain('options.perClaimPartnerCap')
    expect(boundary).toMatch(/const RESPONSE_FLOOR_MS = \d+/)
  })
})
