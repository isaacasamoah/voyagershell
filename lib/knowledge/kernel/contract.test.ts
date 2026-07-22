import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GRAPH_EDGE_KINDS, GRAPH_NODE_KINDS, canonicalEdgeEndpoints, canonicalGraphIdentity } from './contract'
import { knowledgeGraphFixture, validateKnowledgeGraphFixture } from './fixture'
import { renderKnowledgeGraphSql } from './generate-sql'

const cloneFixture = (): unknown => structuredClone(knowledgeGraphFixture)
const readRepoFile = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const migrationPaths = [
  'supabase/migrations/054_knowledge_graph_schema.sql',
  'supabase/migrations/055_knowledge_graph_authorization.sql',
  'supabase/migrations/056_knowledge_graph_retrieval.sql',
] as const
const readMigrations = (): string => migrationPaths.map(readRepoFile).join('\n')

describe('Phase 2 knowledge-graph contract', () => {
  it('owns exactly the six canonical endpoint kinds', () => {
    expect(GRAPH_NODE_KINDS).toEqual(['person', 'voyager', 'voyage', 'space', 'message_event', 'knowledge_unit'])
    expect(new Set(knowledgeGraphFixture.nodes.map((node) => node.kind))).toEqual(new Set(GRAPH_NODE_KINDS))
  })

  it('locks the complete ordered edge vocabulary in TypeScript and PostgreSQL', () => {
    const expected = [
      'authored_by',
      'posted_in',
      'reply_to',
      'in_voyage',
      'member_of',
      'companion_of',
      'derived_from',
      'generated_by',
      'about',
      'supports',
      'contradicts',
      'supersedes',
      'elaborates',
      'relates_to',
      'decided_by',
      'raised_by',
    ]
    const schema = readRepoFile(migrationPaths[0])
    const enumBody = schema.match(/CREATE TYPE public\.graph_edge_kind AS ENUM \(([\s\S]*?)\);/)?.[1] ?? ''
    const declared = Array.from(enumBody.matchAll(/'([^']+)'/g), (match) => match[1])
    const authorization = readRepoFile(migrationPaths[1])

    expect(GRAPH_EDGE_KINDS).toEqual(expected)
    expect(new Set(knowledgeGraphFixture.edges.map((edge) => edge.kind))).toEqual(new Set(expected))
    expect(declared).toEqual(expected)
    expect(authorization).toMatch(
      /WHEN 'generated_by' THEN v_source_kind IN \('message_event', 'knowledge_unit'\)\s+AND v_target_kind = 'voyager'/,
    )
    for (const kind of ['supports', 'contradicts', 'supersedes', 'elaborates']) {
      expect(authorization).toContain(
        `WHEN '${kind}' THEN v_source_kind = 'knowledge_unit' AND v_target_kind = 'knowledge_unit'`,
      )
    }
    for (const kind of ['decided_by', 'raised_by']) {
      expect(authorization).toContain(
        `WHEN '${kind}' THEN v_source_kind = 'knowledge_unit' AND v_target_kind = 'person'`,
      )
    }
    expect(authorization.match(/WHEN '[^']+' THEN NEW\.source_node_id < NEW\.target_node_id/g)).toEqual([
      "WHEN 'relates_to' THEN NEW.source_node_id < NEW.target_node_id",
    ])
  })

  it('binds graph identity to durable authorities while labels can rename', () => {
    for (const rename of knowledgeGraphFixture.renames) {
      const node = knowledgeGraphFixture.nodes.find((candidate) => candidate.id === rename.nodeId)!
      expect(rename.beforeLabel).not.toBe(rename.afterLabel)
      expect(node.identity).toBe(canonicalGraphIdentity(node.kind, node.authorityId))
    }

    for (const event of knowledgeGraphFixture.events) {
      const node = knowledgeGraphFixture.nodes.find((candidate) => candidate.id === event.nodeId)!
      expect(node.kind).toBe('message_event')
      expect(node.authorityId).toBe(event.id)
    }
    for (const unit of knowledgeGraphFixture.units) {
      const node = knowledgeGraphFixture.nodes.find((candidate) => candidate.id === unit.nodeId)!
      expect(node.kind).toBe('knowledge_unit')
      expect(node.authorityId).toBe(unit.id)
    }
  })

  it('stores symmetric relations once in deterministic endpoint order', () => {
    const high = 'f0000000-0000-4000-8000-000000000001'
    const low = '10000000-0000-4000-8000-000000000001'

    for (const kind of GRAPH_EDGE_KINDS) {
      expect(canonicalEdgeEndpoints(kind, high, low)).toEqual(kind === 'relates_to' ? [low, high] : [high, low])
    }
    expect(() => canonicalEdgeEndpoints('relates_to', low, low)).toThrow('self_edge_forbidden')
  })

  it('validates the single explicit-audience fixture and fixed result matrix', () => {
    expect(validateKnowledgeGraphFixture(knowledgeGraphFixture)).toBe(knowledgeGraphFixture)
    expect(knowledgeGraphFixture.expected).toMatchObject({
      nodeCount: 10,
      edgeCount: 25,
      audienceCount: 4,
      sharedClaim: 'Vanessa keeps the amber notebook behind the blue atlas.',
      sharedSourceEventId: knowledgeGraphFixture.events[0].id,
    })
    expect(knowledgeGraphFixture.expected.rootDeniedIdentities).toEqual([])
    expect(knowledgeGraphFixture.expected.victimBridgeIdentities).toHaveLength(1)
  })

  it('rejects absent audience security and split unit provenance', () => {
    const nullAudience = cloneFixture() as {
      nodes: Array<{ audienceKey: string | null }>
    }
    nullAudience.nodes[0].audienceKey = null
    expect(() => validateKnowledgeGraphFixture(nullAudience)).toThrow(
      'knowledge_graph_fixture_invalid:nodes.0.audienceKey',
    )

    const splitProvenance = cloneFixture() as {
      units: Array<{ audienceKey: string }>
    }
    splitProvenance.units[0].audienceKey = 'private-a'
    expect(() => validateKnowledgeGraphFixture(splitProvenance)).toThrow('source_audience_must_match')

    const rivalEventId = cloneFixture() as { events: Array<{ id: string }> }
    rivalEventId.events[0].id = '61000000-0000-4000-8000-000000000099'
    expect(() => validateKnowledgeGraphFixture(rivalEventId)).toThrow('message_authority_must_equal_ledger_id')
  })

  it('rejects duplicate projection identity and noncanonical symmetric edges', () => {
    const duplicate = cloneFixture() as { nodes: Array<{ id: string }> }
    duplicate.nodes[1].id = duplicate.nodes[0].id
    expect(() => validateKnowledgeGraphFixture(duplicate)).toThrow('duplicate_identity')

    const reversed = cloneFixture() as {
      edges: Array<{
        kind: string
        sourceNodeId: string
        targetNodeId: string
      }>
    }
    reversed.edges[0] = {
      kind: 'relates_to',
      sourceNodeId: '70000000-0000-4000-8000-000000000001',
      targetNodeId: '20000000-0000-4000-8000-000000000001',
    }
    expect(() => validateKnowledgeGraphFixture(reversed)).toThrow('noncanonical_direction')
  })

  it('generates two ledger-backed projections and every locked database assertion', () => {
    const sql = renderKnowledgeGraphSql()

    expect(sql.match(/-- fixture projection: (?:initial|renamed)/g)).toHaveLength(2)
    expect(sql.match(/INSERT INTO public\.knowledge_events/g)).toHaveLength(3)
    expect(sql).toContain(knowledgeGraphFixture.expected.sharedClaim)
    expect(sql).toContain('knowledge_graph_idempotent_projection_failed')
    expect(sql).toContain('knowledge_graph_hidden_bridge_leaked')
    expect(sql).toContain('knowledge_graph_root_denial_failed')
    expect(sql).toContain('knowledge_graph_null_source_audience_accepted')
    expect(sql).toContain('NULL::uuid[]')
    expect(sql).not.toMatch(/^BEGIN;|^ROLLBACK;/m)
    expect(renderKnowledgeGraphSql()).toBe(sql)
  })

  it('creates only durable additive graph storage around the existing ledger', () => {
    const migration = readMigrations()
    const createdTables = Array.from(migration.matchAll(/CREATE TABLE public\.([a-z_]+)/g)).map((match) => match[1])

    expect(createdTables).toEqual(['knowledge_audiences', 'knowledge_units', 'graph_nodes', 'graph_edges'])
    expect(migration.indexOf('CREATE TABLE public.knowledge_audiences')).toBeLessThan(
      migration.indexOf('ALTER TABLE public.knowledge_events'),
    )
    expect(migration).toMatch(/source_event_id uuid NOT NULL REFERENCES public\.knowledge_events\(id\)/)
    expect(migration).toContain('UNIQUE (source_event_id, extractor_version, claim_key)')
    expect(migration).toContain('UNIQUE (kind, authority_id)')
    expect(migration).toContain('event.id = NEW.authority_id')
    expect(migration).toContain('event.knowledge_audience_id = NEW.knowledge_audience_id')
    expect(migration).not.toContain('CREATE TABLE public.knowledge_events')
    expect(migration).not.toContain('knowledge_current')
    expect(migration).not.toContain(`ALTER TABLE public.${['knowledge', 'edges'].join('_')}`)
  })

  it('keeps PostgreSQL as the only privacy and traversal engine', () => {
    const migration = readMigrations()
    const contract = readRepoFile('lib/knowledge/kernel/contract.ts')
    const traversalResult = migration.match(/\) RETURNS TABLE \(\n([\s\S]*?)\n\) LANGUAGE sql/)?.[1]

    expect(migration).toContain('CREATE FUNCTION public.traverse_knowledge_graph')
    expect(migration).toContain('p_viewer_profile_id = ANY(source_audience.member_profile_ids)')
    expect(migration).toContain('p_viewer_profile_id = ANY(target_audience.member_profile_ids)')
    expect(migration).toContain('p_viewer_profile_id = ANY(edge_audience.member_profile_ids)')
    expect(traversalResult).toBeDefined()
    expect(traversalResult).not.toContain('path')
    expect(traversalResult).not.toContain('knowledge_audience_id')
    expect(migration).not.toContain('participants')
    expect(migration).not.toContain('event_type')
    expect(migration).not.toContain('knowledge_type')
    expect(contract).not.toMatch(/authorize|canView|memberProfileIds\.includes/)
  })

  it('wraps all target DDL in the hosted recipe rollback and checks catalogue residue', () => {
    const recipe = readRepoFile('recipes/knowledge-graph-poc.sh')
    const combined = [
      ...migrationPaths.map(readRepoFile),
      readRepoFile('lib/knowledge/kernel/assertions-sql.ts'),
      readRepoFile('lib/knowledge/kernel/contract.ts'),
      readRepoFile('lib/knowledge/kernel/fixture.ts'),
      readRepoFile('lib/knowledge/kernel/generate-sql.ts'),
      readRepoFile('lib/knowledge/kernel/sql.ts'),
      recipe,
      readRepoFile('recipes/README.md'),
    ].join('\n')

    expect(recipe).toContain("printf 'BEGIN;\\n'")
    expect(recipe).toContain("printf 'ROLLBACK;\\n'")
    expect(recipe.indexOf(migrationPaths[0])).toBeLessThan(recipe.indexOf(migrationPaths[1]))
    expect(recipe).toContain('"${MIGRATIONS[@]}" "$CUTOVER" "$TEMP_DIR/generated-proof.sql"')
    expect(recipe).toContain('"$TEMP_DIR/k1-setup.sql" "$TEMP_DIR/k1-assertions.sql"')
    expect(recipe).toContain('knowledge_audience_id')
    expect(recipe).toContain('catalog-before.sorted.json')
    expect(recipe).toContain('catalog-after.sorted.json')
    expect(combined).not.toContain(['memory', 'kernel', 'events'].join('_'))
  })
})
