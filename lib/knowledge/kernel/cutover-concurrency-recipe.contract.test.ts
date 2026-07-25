import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const recipe = readFileSync(resolve(process.cwd(),
  'recipes/knowledge-graph-cutover-concurrency.sh'), 'utf8')

describe('legacy graph cutover concurrency recipe', () => {
  it('uses a disposable exact no-network PostgreSQL boundary', () => {
    expect(recipe).toContain('pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee')
    expect(recipe).toContain('--pull=never')
    expect(recipe).toContain('--network none')
    expect(recipe).toContain('voyager-cutover-concurrency-$(date +%s)-$$')
    expect(recipe).toContain('docker_proof_wait_ready "$CONTAINER_NAME" "$DATABASE"')
    expect(recipe).toContain("|| fail 'PostgreSQL readiness timeout'")
    expect(recipe).toContain('docker_proof_cleanup "$CONTAINER_NAME" "$PIDS"')
    for (const file of ['supabase/migrations/054_active_membership_authority.sql',
      '061_knowledge_graph_schema.sql', '062_knowledge_graph_authorization.sql',
      '063_knowledge_graph_retrieval.sql', '064_knowledge_graph_cutover.sql'])
      expect(recipe).toContain(file)
  })

  it('proves a real late authenticated writer blocks then fails closed', () => {
    expect(recipe).toContain('PGAPPNAME=cutover-holder')
    expect(recipe).toContain('PGAPPNAME=cutover-contender')
    expect(recipe).toContain("wait_event_type='Lock'")
    expect(recipe).toContain('pg_blocking_pids')
    expect(recipe).toContain("SET ROLE authenticated")
    expect(recipe).toContain("if wait \"$contender_pid\"; then fail 'late legacy writer committed'; fi")
    expect(recipe).toContain("reason='legacy_edge_unattested'")
    expect(recipe).toContain("source_digest=md5(jsonb_build_array('knowledge_edge:v1'")
    expect(recipe).not.toMatch(/source_(?:payload|content|metadata)/)
  })

  it('creates the only accepted proving edge through the final service RPC', () => {
    expect(recipe).toContain('SET ROLE service_role')
    expect(recipe).toContain('public.write_knowledge_graph_edge')
    expect(recipe).toContain('KNOWLEDGE_GRAPH_CUTOVER_CONCURRENCY_GREEN')
    expect(recipe).not.toContain('docker pull')
  })
})
