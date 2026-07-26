import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  canonicalGraphEdgeId,
  canonicalGraphNodeId,
  canonicalKnowledgeAudienceId,
} from './canonical-ids'
import {
  AUTHORITY_EDGE_KINDS,
  GRAPH_EDGE_KINDS,
  GRAPH_NODE_KINDS,
  canonicalEdgeEndpoints,
  canonicalGraphIdentity,
} from './contract'
import { knowledgeGraphFixture, validateKnowledgeGraphFixture } from './fixture'
import { renderKnowledgeGraphSql } from './generate-sql'

const readRepoFile = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const cutoverGraphPaths = ['supabase/migrations/064_knowledge_graph_cutover.sql',
  'supabase/migrations/065_knowledge_graph_authority_projection.sql',
  'supabase/migrations/066_knowledge_graph_membership_projection.sql',
  'supabase/migrations/067_knowledge_graph_projection_activation.sql'] as const
const migrationPaths = [
  'supabase/migrations/061_knowledge_graph_schema.sql',
  'supabase/migrations/062_knowledge_graph_authorization.sql',
  'supabase/migrations/063_knowledge_graph_retrieval.sql',
  ...cutoverGraphPaths]
const migrations = (): string => migrationPaths.map(readRepoFile).join('\n')
const cloneFixture = (): any => structuredClone(knowledgeGraphFixture)

describe('ORU-319 final graph substrate contract', () => {
  it('locks six canonical node kinds and all sixteen edge kinds', () => {
    expect(new Set(knowledgeGraphFixture.nodes.map((node) => node.kind))).toEqual(new Set(GRAPH_NODE_KINDS))
    const exercised = new Set([
      ...knowledgeGraphFixture.edges.map((edge) => edge.kind),
      ...AUTHORITY_EDGE_KINDS,
    ])
    expect(exercised).toEqual(new Set(GRAPH_EDGE_KINDS))
    const schema = readRepoFile(migrationPaths[0])
    const declared = Array.from(
      (schema.match(/CREATE TYPE public\.graph_edge_kind AS ENUM \(([\s\S]*?)\);/)?.[1] ?? '')
        .matchAll(/'([^']+)'/g),
      (match) => match[1],
    )
    expect(declared).toEqual(GRAPH_EDGE_KINDS)
  })

  it('keeps one scope-neutral identity while labels rename', () => {
    for (const node of knowledgeGraphFixture.nodes) {
      expect(node.identity).toBe(canonicalGraphIdentity(node.kind, node.authorityId))
      expect(node).not.toHaveProperty('audienceKey')
    }
    expect(knowledgeGraphFixture.nodes.filter((node) => node.kind === 'person'
      && node.authorityId === knowledgeGraphFixture.authorityScenario.crossScopePersonId)).toHaveLength(1)
    expect(knowledgeGraphFixture.renames.map((rename) => rename.afterLabel)).toEqual(['Vanessa Hart', 'northstar'])
  })

  it('stores only historical evidence edges in graph_edges', () => {
    expect(knowledgeGraphFixture.edges.every((edge) => !AUTHORITY_EDGE_KINDS.includes(edge.kind as never))).toBe(true)
    expect(knowledgeGraphFixture.edges.every((edge) => edge.evidenceEventIds.length > 0)).toBe(true)
    for (const edge of knowledgeGraphFixture.edges) {
      expect(canonicalEdgeEndpoints(edge.kind, edge.sourceNodeId, edge.targetNodeId))
        .toEqual([edge.sourceNodeId, edge.targetNodeId])
    }
  })

  it('enforces canonical v2 IDs for fixture and privileged direct edge inserts', () => {
    const schema = readRepoFile(migrationPaths[0])
    const product = readRepoFile('supabase/migrations/054_active_membership_authority.sql')
    const proof = renderKnowledgeGraphSql()
    expect(schema).toContain('CREATE FUNCTION public.canonical_graph_edge_id')
    expect(schema).toContain("voyager-edge:v2:%s:%s:%s")
    expect(schema).toContain('CONSTRAINT graph_edges_canonical_id CHECK')
    expect(schema).toContain('id = public.canonical_graph_edge_id(source_node_id, kind, target_node_id)')
    for (const edge of knowledgeGraphFixture.edges) {
      expect(edge.id).toBe(canonicalGraphEdgeId(edge.sourceNodeId, edge.kind, edge.targetNodeId))
    }
    for (const node of knowledgeGraphFixture.nodes) {
      expect(node.id).toBe(canonicalGraphNodeId(node.kind, node.authorityId))
    }
    for (const audience of knowledgeGraphFixture.audiences) {
      expect(audience.id).toBe(canonicalKnowledgeAudienceId(audience.purpose,
        audience.scopeKind, audience.scopeAuthorityId, audience.memberProfileIds))
    }
    expect(schema).toContain('CONSTRAINT graph_nodes_canonical_id CHECK')
    expect(schema).toContain('CONSTRAINT knowledge_audiences_canonical_id CHECK')
    expect(product).toContain('id uuid GENERATED ALWAYS AS')
    expect(proof).toContain('knowledge_graph_space_member_id_not_canonical')
    expect(proof).toContain('knowledge_graph_explicit_space_member_id_accepted')
    const nondeterministic = cloneFixture()
    nondeterministic.edges[0].id = '82000000-0000-4000-8000-000000000002'
    expect(() => validateKnowledgeGraphFixture(nondeterministic)).toThrow('id:not_canonical')
    expect(proof).toContain("'82000000-0000-4000-8000-000000000002'")
    expect(proof).toContain('knowledge_graph_nondeterministic_edge_accepted')
    expect(proof).toContain('INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)')
    expect(proof).not.toContain('85000000-0000-4000-8000-00000000000')
  })

  it('validates multi-scope source grants and rejects split provenance', () => {
    expect(validateKnowledgeGraphFixture(knowledgeGraphFixture)).toBe(knowledgeGraphFixture)
    expect(knowledgeGraphFixture.expected).toMatchObject({
      nodeCount: 18,
      historicalEdgeCount: 18,
      sourceAudienceCount: 3,
    })
    const split = cloneFixture()
    split.units[0].audienceKey = 'private-a'
    expect(() => validateKnowledgeGraphFixture(split)).toThrow('source_audience_must_match')
    const noEvidence = cloneFixture()
    noEvidence.edges[0].evidenceEventIds = []
    expect(() => validateKnowledgeGraphFixture(noEvidence)).toThrow('evidence_required')
    const unboundEvidence = cloneFixture()
    unboundEvidence.edges[0].evidenceEventIds = [unboundEvidence.events.at(-1).id]
    expect(() => validateKnowledgeGraphFixture(unboundEvidence)).toThrow('evidence_not_bound_to_endpoint')
    const duplicate = cloneFixture()
    duplicate.nodes[1].id = duplicate.nodes[0].id
    expect(() => validateKnowledgeGraphFixture(duplicate)).toThrow('id:not_canonical')
  })

  it('defines neutral registry, immutable grants/evidence, and current authority projection', () => {
    const schema = readRepoFile(migrationPaths[0])
    const graphNodes = schema.match(/CREATE TABLE public\.graph_nodes \(([\s\S]*?)\n\);/)?.[1] ?? ''
    const graphEdges = schema.match(/CREATE TABLE public\.graph_edges \(([\s\S]*?)\n\);/)?.[1] ?? ''
    expect(schema).toContain("CREATE TYPE public.knowledge_audience_purpose AS ENUM ('source', 'authority')")
    expect(graphNodes).not.toContain('knowledge_audience_id')
    expect(graphEdges).not.toContain('knowledge_audience_id')
    expect(graphEdges).toContain('id uuid PRIMARY KEY')
    expect(schema).toContain('CREATE TABLE public.graph_node_grants')
    expect(schema).toContain('basis_version bigint NOT NULL')
    expect(schema).toContain('label_snapshot text NOT NULL')
    expect(schema).toContain('CREATE TABLE public.graph_edge_evidence')
    expect(schema).toContain('CREATE TABLE public.graph_authority_edges')
    expect(schema).toContain("kind NOT IN ('member_of', 'in_voyage', 'companion_of')")
  })

  it('versions product memberships and rechecks exact current authority rows', () => {
    const product = readRepoFile('supabase/migrations/054_active_membership_authority.sql')
    const retrieval = readRepoFile(migrationPaths[2])
    const projection = migrationPaths.slice(4, 7).map(readRepoFile).join('\n')
    for (const column of ['state_changed_at timestamptz', 'revision bigint']) expect(product).toContain(column)
    expect(product).toContain('NEW.revision := OLD.revision + 1')
    expect(product).toContain('NEW.state_changed_at := clock_timestamp()')
    expect(projection).toContain('FOR v_member IN SELECT id FROM public.voyage_members')
    expect(projection).toContain('FOR v_member IN SELECT id FROM public.space_members')
    expect(projection).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(product).toContain('space_authority_identity_immutable')
    const cutover = readRepoFile(migrationPaths[3])
    expect(cutover).toMatch(/REVOKE ALL ON public\.knowledge_audiences, public\.knowledge_units, public\.graph_nodes/)
    expect(cutover).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(retrieval).toContain('member.revision = edge.authority_revision')
    expect(retrieval).toContain('member.state_changed_at = edge.effective_at')
    expect(retrieval).toContain('audience.member_profile_ids = coalesce')
  })

  it('conjunctively checks evidence, endpoint grants, and source audiences per hop', () => {
    const authorization = readRepoFile(migrationPaths[1])
    const retrieval = readRepoFile(migrationPaths[2])
    expect(retrieval).toContain('public.viewer_has_graph_node_grant(edge.source_node_id')
    expect(retrieval).toContain('public.viewer_has_graph_node_grant(edge.target_node_id')
    expect(retrieval).toMatch(/FROM public\.graph_edge_evidence evidence\s+JOIN public\.knowledge_events event/)
    expect(retrieval).toContain('JOIN public.knowledge_events event')
    expect(retrieval).toContain('public.graph_node_source_audience(p_node_id)')
    expect(authorization).toContain("WHEN 'edge_evidence' THEN")
    expect(authorization).toContain("v_node.kind NOT IN ('message_event', 'knowledge_unit')")
    expect(authorization).toContain('NEW.node_id IN (edge.source_node_id, edge.target_node_id)')
    expect(authorization).toContain('v_audience.scope_authority_id = member.voyage_id')
    expect(authorization).toContain('v_audience.member_profile_ids = coalesce')
    expect(renderKnowledgeGraphSql()).toContain('knowledge_graph_content_edge_evidence_grant_accepted')
    expect(renderKnowledgeGraphSql()).toContain('knowledge_graph_unbound_edge_evidence_accepted')
    expect(retrieval).toContain('source_grant.basis_id = edge.id')
    expect(retrieval).toContain('target_grant.basis_event_id = evidence.evidence_event_id')
  })

  it('returns historical labels from grants and current labels only through current authority', () => {
    const retrieval = readRepoFile(migrationPaths[2])
    expect(retrieval).toContain('CREATE FUNCTION public.graph_node_label_for_viewer')
    expect(retrieval).toContain('public.viewer_has_current_graph_node')
    expect(retrieval).toContain('grant_row.label_snapshot')
    const traversalResult = retrieval.match(/CREATE FUNCTION public\.traverse_knowledge_graph[\s\S]*?RETURNS TABLE \(([\s\S]*?)\n\)/)?.[1] ?? ''
    expect(traversalResult).not.toMatch(/path|count|audience|evidence/)
  })

  it('generates replay, cross-scope, transition, tamper, and timing proofs', () => {
    const sql = renderKnowledgeGraphSql()
    for (const verdict of [
      'knowledge_graph_idempotent_projection_failed',
      'knowledge_graph_red_viewer_blue_leak',
      'knowledge_graph_blue_viewer_red_leak',
      'knowledge_graph_historical_label_leak',
      'knowledge_graph_new_member_gained_old_source',
      'knowledge_graph_rejoin_gained_absence_source',
      'knowledge_graph_post_rejoin_source_missing',
      'knowledge_graph_stale_authority_grant_accepted',
      'knowledge_graph_authority_tamper_accepted',
      'knowledge_graph_registry_label_tamper_accepted',
      'knowledge_graph_denial_timing_class_failed',
    ]) expect(sql).toContain(verdict)
    expect(renderKnowledgeGraphSql()).toBe(sql)
    expect(sql).not.toMatch(/^BEGIN;|^ROLLBACK;/m)
  })

  it('keeps the allowed service writer assertion output-free and failure-explicit', () => {
    const sql = renderKnowledgeGraphSql()
    expect(sql).toContain('DO $allowed_writer$')
    expect(sql).toContain('knowledge_graph_service_writer_returned_false')
    expect(sql).not.toMatch(/^SELECT public\.write_knowledge_graph_edge/m)
  })

  it('runs the uninstalled graph and active-membership cut in one rollback recipe', () => {
    const recipe = readRepoFile('recipes/knowledge-graph-poc.sh')
    const transaction = readRepoFile('recipes/lib/knowledge-graph-transaction.sh')
    expect(transaction).toContain('BEGIN;')
    expect(transaction).toContain('ROLLBACK;')
    expect(transaction).toContain('sed -n \'1,$p\' "$CUTOVER"')
    expect(transaction).toContain('for migration in "${PROJECTIONS[@]}"')
    expect(transaction).toContain('sed -n \'1,$p\' "$ACTIVATION"')
    expect(transaction).toContain('for migration in "${PRODUCT_MIGRATIONS[@]}"')
    expect(transaction).toContain('sed -n \'1,$p\' "$INSTALLED_POSTCONDITION"')
    expect(transaction).toContain('for migration in "${MIGRATIONS[@]}"')
    expect(transaction.indexOf('for migration in "${PRODUCT_MIGRATIONS[@]}"'))
      .toBeLessThan(transaction.indexOf('sed -n \'1,$p\' "$INSTALLED_POSTCONDITION"'))
    expect(transaction.indexOf('sed -n \'1,$p\' "$INSTALLED_POSTCONDITION"'))
      .toBeLessThan(transaction.indexOf('for migration in "${MIGRATIONS[@]}"'))
    expect(recipe).toContain('catalog-before.sorted.json')
    expect(recipe).toContain('catalog-after.sorted.json')
  })

  it('preserves knowledge_events as the only event-content ledger', () => {
    const sql = migrations()
    const table = sql.match(/CREATE TABLE public\.knowledge_graph_backfill_rejections \(([\s\S]*?)\n\);/)?.[1] ?? ''
    const columns = Array.from(table.matchAll(/^\s{2}([a-z][a-z0-9_]*)\s+/gm), (match) => match[1])
    expect(columns).toEqual(['source_kind', 'source_id', 'reason', 'source_digest'])
    const writes = Array.from(sql.matchAll(/INSERT INTO public\.knowledge_graph_backfill_rejections[\s\S]*?;/g), (match) => match[0]).join('\n')
    expect(writes).not.toMatch(/\b(?:to_jsonb|row_to_json|jsonb_agg|array_agg)\s*\(\s*[a-z][a-z0-9_]*\s*\)|\b[a-z][a-z0-9_]*\.(?:\*|content|metadata|source_ref)\b/)
    expect(sql).toContain('ALTER TABLE public.knowledge_events')
  })
})
