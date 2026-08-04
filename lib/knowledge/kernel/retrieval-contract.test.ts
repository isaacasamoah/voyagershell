import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { K2_GRAPH_NODE_KINDS } from './contract'
import { knowledgeGraphFixture } from './fixture'
import { renderKnowledgeGraphSql } from './generate-sql'

const readRepoFile = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const retrieval = (): string => readRepoFile('supabase/migrations/063_knowledge_graph_retrieval.sql')

describe('knowledge-graph retrieval contract', () => {
  it('keeps all six root kinds behind one database traversal', () => {
    const sql = renderKnowledgeGraphSql()
    for (const kind of K2_GRAPH_NODE_KINDS) {
      expect(sql).toContain(`('${kind}'::public.graph_node_kind`)
    }
    expect(sql).toContain('knowledge_graph_six_kind_retrieval_failed')
  })

  it('exposes only exact claim and immutable source fields', () => {
    const migration = retrieval()
    const result = migration.match(/CREATE FUNCTION public\.retrieve_knowledge_graph_claims[\s\S]*?RETURNS TABLE \(([\s\S]*?)\n\)/)?.[1]
    expect(result?.match(/[a-z_]+ uuid|[a-z_]+ text/g)).toEqual([
      'knowledge_unit_id uuid', 'claim text', 'source_event_id uuid', 'source_content text',
    ])
    for (const denied of ['path', 'result_count', 'knowledge_audience_id', 'edge_id', 'evidence_event_id']) {
      expect(result).not.toContain(denied)
    }
  })

  it('checks graph-on/off, hidden bridges, cross-scope denial, and timing equality', () => {
    const sql = renderKnowledgeGraphSql()
    const database = retrieval()
    const rpc = database.match(
      /CREATE FUNCTION public\.retrieve_knowledge_graph_claims[\s\S]*?\n\$\$;/,
    )?.[0] ?? ''
    expect(sql).toContain('knowledge_graph_off_retrieval_found_claim')
    expect(rpc).toContain('IF p_graph_enabled IS NOT TRUE THEN')
    expect(rpc.indexOf('IF p_graph_enabled IS NOT TRUE THEN'))
      .toBeLessThan(rpc.indexOf('RETURN QUERY'))
    expect(rpc).not.toContain('CASE WHEN p_graph_enabled THEN p_max_depth ELSE 0 END')
    expect(sql).toContain('knowledge_graph_hidden_bridge_leaked')
    expect(sql).toContain('knowledge_graph_cross_scope_content_leak')
    expect(sql).toContain('knowledge_graph_denial_timing_class_failed')
    expect(sql).toContain('knowledge_graph_mutable_source_accepted')
  })

  it('keeps the RPC service-only and pads every outcome', () => {
    const database = retrieval()
    const schema = readRepoFile('supabase/migrations/061_knowledge_graph_schema.sql')
    const boundary = readRepoFile('lib/knowledge/kernel/boundary.ts')
    expect(database.match(/0\.075 - extract\(epoch/g)).toHaveLength(2)
    expect(schema).toContain('trg_knowledge_event_source_immutable')
    expect(database).not.toContain('guard_knowledge_event_source')
    expect(database).toContain('FROM PUBLIC, anon, authenticated')
    expect(database).toContain('TO service_role')
    for (const helper of [
      'viewer_has_graph_node_grant', 'graph_authority_edge_is_current',
      'graph_node_label_for_viewer', 'authorized_graph_neighbors',
    ]) expect(database).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${helper}`))
    expect(boundary).toContain('const RESPONSE_FLOOR_MS = 556')
    expect(boundary).toContain('const RPC_DEADLINE_MS = 8_000')
    expect(boundary).toContain('typeof envelope.truncated !== "boolean"')
    expect(boundary).toMatch(
      /return complete\(\{\s*outcome: "success",\s*claims,\s*truncated: envelope\.truncated,\s*\}\)/,
    )
  })

  // The browser gate caught 055 raising 42883 on both real Voyager databases:
  // it qualified the distance operator to `extensions` while migration 002
  // installs pgvector into `public`, so semantic search silently returned
  // nothing and hybrid search degraded to keyword-only. The disposable baseline
  // hid it by installing the extension into `extensions`. The baseline is the
  // half that lied, so pin it to the shape the product actually runs.
  it('models pgvector in the schema the product installs it into', () => {
    expect(readRepoFile('supabase/migrations/002_memory_schema.sql'))
      .toContain('CREATE EXTENSION IF NOT EXISTS vector;')
    expect(readRepoFile('recipes/sql/installed-pre-054/core.sql'))
      .toContain('CREATE EXTENSION vector WITH SCHEMA public;')
    expect(readRepoFile('supabase/migrations/055_active_knowledge_retrieval.sql'))
      .not.toContain('OPERATOR(extensions.<=>)')
  })

  it('uses exact KnowledgeUnit/source audience inheritance', () => {
    const fixture = knowledgeGraphFixture
    for (const unit of fixture.units) {
      const event = fixture.events.find((candidate) => candidate.id === unit.sourceEventId)
      expect(event?.audienceKey).toBe(unit.audienceKey)
    }
    expect(readRepoFile('supabase/migrations/062_knowledge_graph_authorization.sql'))
      .toContain('event.knowledge_audience_id = NEW.knowledge_audience_id')
  })
})
