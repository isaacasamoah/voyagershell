import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderFrontierAssertionsSql } from './frontier-assertions-sql'
import { knowledgeGraphFixture } from './fixture'

const migration = readFileSync(resolve(process.cwd(),
  'supabase/migrations/063_knowledge_graph_retrieval.sql'), 'utf8')
const traversal = migration.match(/CREATE FUNCTION public\.traverse_knowledge_graph\([\s\S]*?\n\$\$;/)?.[0] ?? ''
const proof = renderFrontierAssertionsSql(knowledgeGraphFixture)

describe('bounded graph frontier', () => {
  it('uses visited frontier expansion, not simple-path enumeration', () => {
    expect(traversal).toContain('v_frontier uuid[]')
    expect(traversal).toContain('NOT neighbor.node_id = ANY(v_seen)')
    expect(traversal).toContain('SELECT DISTINCT neighbor.node_id')
    expect(traversal).not.toContain('WITH RECURSIVE')
    expect(traversal).not.toContain('UNION ALL')
  })

  it('enforces explicit bounded node and frontier budgets', () => {
    expect(traversal).toContain('knowledge_graph_frontier_budget_exceeded')
    expect(traversal).toContain('knowledge_graph_node_budget_exceeded')
    expect(traversal).toContain('LIMIT v_frontier_budget + 1')
    expect(traversal).toContain('coalesce(p_node_budget, 512)')
    expect(traversal).toContain('coalesce(p_frontier_budget, 128)')
  })

  it('renders a dense cyclic timeout proof with exact unique results', () => {
    expect(proof).toContain('FOR v_i IN 1..11')
    expect(proof).toContain('FOR v_j IN (v_i + 1)..12')
    expect(proof).toContain("set_config('statement_timeout', '750ms', true)")
    expect(proof).toContain('v_count <> 12 OR v_unique <> 12')
    expect(proof).toContain('knowledge_graph_frontier_budget_not_enforced')
  })
})
