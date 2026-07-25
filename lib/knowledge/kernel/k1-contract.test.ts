import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderKnowledgeGraphSql } from './generate-sql'
import { renderActiveMembershipAssertionsSql } from './active-membership-assertions-sql'
import { renderAuthorityBoundaryAssertionsSql, renderAuthorityGapSetupSql } from './authority-boundary-sql'
import { createK1FixtureSeed } from './k1-fixture-seed'
import { renderK1CutoverAssertionsSql } from './k1-cutover-assertions-sql'
import { renderK1LegacySetupSql } from './k1-legacy-setup-sql'
const readRepoFile = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const migration = (): string => readRepoFile('supabase/migrations/064_knowledge_graph_cutover.sql')
const oldTable = ['knowledge', 'edges'].join('_')
const oldRpc = ['graph', 'traverse'].join('_')
const k1Seed = createK1FixtureSeed('oru-319-k1-contract')
const assertionSql = (): string => renderK1CutoverAssertionsSql(k1Seed)
describe('K1 final-shape backfill contract', () => {
  it('maps only explicit immutable source audiences and reports unresolved rows', () => {
    const sql = migration()
    expect(sql).toMatch(/public\.canonical_knowledge_audience_id\(\s*'source'/)
    expect(sql).toContain("WHEN members = '{}'::uuid[] THEN 'source_audience_not_explicit'")
    expect(sql).not.toContain('space_voyage_unresolved')
    expect(sql).toContain('knowledge_graph_backfill_rejections')
    expect(sql).toContain('source_author_not_attested')
    expect(sql).toContain('session_authority_malformed')
    expect(sql).toContain('session_authority_unresolved')
    expect(sql).toContain('session_voyage_mismatch')
    expect(sql).toContain('space_authority_unresolved')
    expect(sql).toContain('space_voyage_mismatch')
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.guard_knowledge_event_audience')
    expect(readRepoFile('supabase/migrations/062_knowledge_graph_authorization.sql'))
      .toContain('OLD.knowledge_audience_id IS NOT NULL')
    expect(sql).not.toContain('participants @>')
  })
  it('types every enum literal emitted by K1 INSERT SELECT backfills', () => {
    const sql = migration()
    const audiences = sql.slice(sql.indexOf('INSERT INTO public.knowledge_audiences'),
      sql.indexOf('INSERT INTO public.graph_nodes'))
    const nodes = sql.slice(sql.indexOf('INSERT INTO public.graph_nodes'),
      sql.indexOf('INSERT INTO public.graph_node_grants'))
    const authorityEdges = sql.slice(sql.indexOf('INSERT INTO public.graph_authority_edges'),
      sql.indexOf('CREATE TEMP TABLE k1_edge_map'))
    expect(audiences.match(/'source'::public\.knowledge_audience_purpose/g)).toHaveLength(1)
    expect(audiences.match(/'authority'::public\.knowledge_audience_purpose/g)).toHaveLength(3)
    for (const scope of ['private', 'voyage', 'space']) {
      expect(audiences.match(new RegExp(`'${scope}'::public\\.knowledge_audience_scope_kind`, 'g')))
        .toHaveLength(1)
    }
    for (const kind of ['person', 'voyager', 'voyage', 'space', 'message_event']) {
      expect(nodes.match(new RegExp(`'${kind}'::public\\.graph_node_kind`, 'g'))).toHaveLength(1)
    }
    expect(authorityEdges.match(/'member_of'::public\.graph_edge_kind/g)).toHaveLength(2)
    for (const kind of ['companion_of', 'in_voyage']) {
      expect(authorityEdges.match(new RegExp(`'${kind}'::public\\.graph_edge_kind`, 'g'))).toHaveLength(1)
    }
    expect(sql).not.toContain("'relates_to'::public.graph_edge_kind")
    expect(sql).toContain("'legacy_edge_unattested'")
  })

  it('backfills Person, Voyager, Voyage, Space, and eligible Message once', () => {
    const sql = migration()
    for (const kind of ['person', 'voyager', 'voyage', 'space', 'message_event']) {
      expect(sql).toContain(`'${kind}'`)
    }
    expect(sql).toContain('ON CONFLICT (kind, authority_id) DO NOTHING')
    expect(sql).toMatch(/'space'::public\.graph_node_kind[\s\S]*FROM public\.spaces/)
    expect(sql).toMatch(/authority_kind[\s\S]*WHERE space\.voyage_id IS NOT NULL/)
    expect(assertionSql()).toContain('knowledge_graph_k1_identity_backfill_failed')
  })

  it('rejects every legacy edge and creates accepted evidence only after cutover', () => {
    const sql = migration()
    expect(sql).toContain('LOCK TABLE public.knowledge_edges IN ACCESS EXCLUSIVE MODE')
    expect(sql).toMatch(/'knowledge_edge:v1',\s*edge\.id, edge\.source_id, edge\.target_id, edge\.edge_type/)
    expect(sql).not.toContain('CREATE TEMP TABLE k1_edge_map')
    expect(sql).not.toContain('INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)\nSELECT')
    expect(sql).not.toMatch(/graph_edges\([^)]*knowledge_audience_id/)
    expect(sql).not.toContain('common_members')
    expect(assertionSql()).toContain('knowledge_graph_k1_rejection_report_failed')
    expect(assertionSql()).toContain('JOIN public.knowledge_events event ON event.id = rejection.source_id')
    expect(assertionSql()).toContain('write_knowledge_graph_edge')
  })

  it('keeps one evidence-derived writer and rejects authority kinds', () => {
    const sql = migration()
    expect(sql).toContain('CREATE FUNCTION public.write_knowledge_graph_edge')
    expect(sql).toContain("p_kind IN ('member_of', 'in_voyage', 'companion_of')")
    expect(sql).toContain('edge_evidence_source_required')
    expect(sql).toContain('v_edge := public.canonical_graph_edge_id(v_source.id, p_kind, v_target.id)')
    expect(sql).not.toContain("md5(format('voyager-edge:v2")
    expect(sql).toContain('INSERT INTO public.graph_edge_evidence')
    expect(sql).toContain('REVOKE ALL ON public.knowledge_audiences, public.knowledge_units, public.graph_nodes')
    expect(sql).toContain('GRANT SELECT ON public.knowledge_audiences, public.knowledge_units, public.graph_nodes')
  })

  it('canonicalizes symmetric endpoints through one typed composite swap', () => {
    const sql = migration()
    expect(sql).toContain('v_swap public.graph_nodes')
    expect(sql).toMatch(/v_swap := v_source;[\s\S]*v_source := v_target;[\s\S]*v_target := v_swap;/)
    expect(sql).not.toMatch(/SELECT\s+v_target\s*,\s*v_source\s+INTO\s+v_source\s*,\s*v_target/)
  })

  it('seeds exact authorities and proves unresolved exclusion plus write-through retrieval', () => {
    const setup = renderK1LegacySetupSql(k1Seed)
    const assertions = assertionSql()
    expect(setup).toContain(`INSERT INTO public.${oldTable}`)
    expect(setup).toContain(k1Seed.orphanSpaceId)
    expect(setup).toContain(k1Seed.malformedSessionEventId)
    expect(setup).toContain(k1Seed.mismatchedSpaceEventId)
    expect(setup).toContain(k1Seed.crossVoyageSessionEventId)
    expect(setup).toContain('INSERT INTO public.voyage_members')
    expect(setup).toContain('INSERT INTO public.space_members')
    expect(assertions).toContain('knowledge_graph_k1_unresolved_event_entered_graph')
    expect(assertions).toContain('knowledge_graph_k1_rejection_report_failed')
    expect(assertions).toContain('knowledge_graph_k1_exact_source_audiences_failed')
    expect(assertions).toContain('knowledge_graph_k1_null_audience_recovery_failed')
    expect(assertions).toContain('knowledge_graph_k1_second_audience_change_accepted')
    expect(assertions).toContain('knowledge_graph_k1_write_retrieval_failed')
    expect(assertions).toContain('knowledge_graph_link_created_grant')
    expect(assertions).toContain('public.graph_node_grants')
  })

  it('isolates each hosted run without reusing active or conflicting rows', () => {
    const setup = renderK1LegacySetupSql(k1Seed)
    const otherSeed = createK1FixtureSeed('oru-319-k1-contract-other')
    const generator = readRepoFile('lib/knowledge/kernel/generate-k1-sql.ts')
    expect(otherSeed.ownerId).not.toBe(k1Seed.ownerId)
    expect(renderK1LegacySetupSql(k1Seed)).toBe(setup)
    expect(setup).toContain('INSERT INTO public.sessions(id, user_id, voyage_id, space_id, status)')
    expect(setup.match(/'historical'/g)).toHaveLength(5)
    expect(setup).not.toContain('ON CONFLICT')
    expect(generator).toContain('const seed = createRandomK1FixtureSeed()')
    expect(generator).toContain('"--legacy-output"), renderK1LegacySetupSql(seed)')
    expect(generator).toContain('"--historical-output"), renderK1HistoricalSetupSql(seed)')
    expect(generator).toContain('renderK1CutoverAssertionsSql(seed)')
  })

  it('removes all old runtime and storage residue in the same migration', () => {
    const sql = migration()
    expect(sql).toContain(`DROP TABLE public.${oldTable}`)
    expect(sql.match(new RegExp(`DROP FUNCTION IF EXISTS public\\.${oldRpc}`, 'g'))).toHaveLength(3)
    expect(assertionSql()).toContain('knowledge_graph_k1_old_catalogue_present')
  })

  it('orders the catch-up gap and all proofs in one rollback transaction', () => {
    const recipe = readRepoFile('recipes/knowledge-graph-poc.sh')
    const transaction = readRepoFile('recipes/lib/knowledge-graph-transaction.sh')
    expect(transaction.indexOf('k1-legacy.sql')).toBeLessThan(transaction.indexOf('PRODUCT_MIGRATIONS'))
    expect(transaction.indexOf('k1-historical.sql')).toBeLessThan(transaction.indexOf('$CUTOVER'))
    expect(transaction.indexOf('$CUTOVER')).toBeLessThan(transaction.indexOf('gap-setup.sql'))
    expect(transaction.indexOf('gap-setup.sql')).toBeLessThan(transaction.indexOf('$ACTIVATION'))
    expect(transaction.indexOf('$ACTIVATION')).toBeLessThan(transaction.indexOf('generated-proof.sql'))
    expect(transaction.indexOf('generated-proof.sql')).toBeLessThan(transaction.indexOf('k1-assertions.sql'))
    expect(recipe).toContain('catalog-before.sorted.json')
    expect(recipe).toContain('catalog-after.sorted.json')
    const catalog = readRepoFile('recipes/sql/knowledge-graph/catalog-targets.sql')
    expect(catalog).toContain("'graph_node_grants'")
    expect(catalog).toContain("'graph_authority_edges'")
  })

  it('keeps the expanded fixture bounded after K1 backfill', () => {
    const generated = renderKnowledgeGraphSql()
    expect(generated).toContain('knowledge_graph_canonical_counts_failed')
    expect(generated).toContain('knowledge_graph_cross_scope_identity_duplicated')
    expect(generated).toContain('knowledge_graph_rejoin_projection_mismatch')
  })

  it('serializes and deterministically rebuilds each membership scope', () => {
    const sql = readRepoFile('supabase/migrations/067_knowledge_graph_projection_activation.sql')
    const product = readRepoFile('supabase/migrations/054_active_membership_authority.sql')
    expect(sql).toContain("'voyage:' || v_scope")
    expect(sql).toContain('WHERE voyage_id = v_scope ORDER BY id LOOP')
    expect(sql).toContain("'space:' || v_scope")
    expect(sql).toContain('WHERE space_id = v_scope ORDER BY id LOOP')
    expect(readRepoFile('supabase/migrations/066_knowledge_graph_membership_projection.sql'))
      .toContain("'space:' || p_space_id")
    expect(sql).toContain('LOCK TABLE public.profiles, public.voyages, public.voyage_members')
    expect(product).toMatch(/UPDATE public\.space_members child SET state = 'left'[\s\S]*parent\.state = 'active'/)
    expect(product).toContain('trg_voyage_member_deactivate_children')
    expect(sql).toContain('DO $catchup$')
  })

  it('keeps every polymorphic trigger field valid for all bound row shapes', () => {
    const product = readRepoFile('supabase/migrations/054_active_membership_authority.sql')
    const sql = readRepoFile('supabase/migrations/067_knowledge_graph_projection_activation.sql')
    const body = (name: string): string => sql.match(new RegExp(
      `CREATE FUNCTION public\\.${name}\\(\\)[\\s\\S]*?\\n\\$\\$;`,
    ))?.[0] ?? ''
    const guard = product.match(/CREATE FUNCTION public\.guard_membership_authority_transition\(\)[\s\S]*?\n\$\$;/)?.[0] ?? ''
    const projection = body('project_graph_authority_trigger')
    const directGuardFields = Array.from(guard.matchAll(/\b(?:NEW|OLD)\.([a-z_]+)/g),
      (match) => match[1]).filter((field): field is string => Boolean(field))
    expect(new Set(directGuardFields)).toEqual(new Set([
      'id', 'user_id', 'state', 'revision', 'state_changed_at',
    ]))
    expect(guard).toContain('to_jsonb(NEW)->>TG_ARGV[0]')
    expect(guard).toContain('to_jsonb(OLD)->>TG_ARGV[0]')
    expect(projection).not.toMatch(/\b(?:NEW|OLD)\.[a-z_]+/)
    for (const field of ['id', 'voyage_id', 'space_id']) expect(projection).toContain(`v_row->>'${field}'`)
    expect(product.match(/EXECUTE FUNCTION public\.guard_membership_authority_transition\('[^']+', '[^']+'\)/g))
      .toHaveLength(2)
    expect(guard).toContain("TG_ARGV[1] = 'stored'")
    expect(sql.match(/EXECUTE FUNCTION public\.project_graph_authority_trigger\(\)/g))
      .toHaveLength(10)
  })

  it('proves active-only product access, same-row crew rejoin, and parent deletion', () => {
    const active = renderActiveMembershipAssertionsSql(k1Seed)
    const boundary = renderAuthorityBoundaryAssertionsSql(k1Seed)
    expect(active).toContain('knowledge_graph_left_member_product_access')
    expect(active).toContain('knowledge_graph_left_member_search_accepted')
    expect(active).toContain('knowledge_graph_left_member_keyword_accepted')
    expect(active).toContain('knowledge_graph_left_member_scoped_accepted')
    expect(active).toContain('knowledge_graph_forged_search_user_accepted')
    expect(active).toContain('knowledge_graph_forged_keyword_user_accepted')
    expect(active).toContain('knowledge_graph_forged_scoped_user_accepted')
    expect(active).toContain('knowledge_graph_left_member_admin_search_accepted')
    expect(active).toContain('knowledge_graph_scoped_overload_residue')
    expect(active).toContain('knowledge_graph_left_member_promotion_accepted')
    expect(active).toContain('role = \'crew\' AND revision = v_revision + 2')
    expect(renderAuthorityGapSetupSql(k1Seed)).toContain('after 057 but before trigger activation')
    expect(boundary).toContain('knowledge_graph_activation_catchup_failed')
    expect(boundary).toContain('knowledge_graph_parent_delete_removed_grants')
  })
  it('never consumes the knowledge event sequence in rollback proof SQL', () => {
    const rendered = [renderKnowledgeGraphSql(), renderK1LegacySetupSql(k1Seed), assertionSql()].join('\n')
    const inserts = Array.from(rendered.matchAll(
      /INSERT INTO public\.knowledge_events\s*\(([^)]*)\)/g,
    ), (match) => match[1])
    expect(inserts.length).toBeGreaterThan(0)
    expect(inserts.every((columns) => columns?.includes('sequence_num'))).toBe(true)
    const transaction = readRepoFile('recipes/lib/knowledge-graph-transaction.sh')
    expect(transaction).toContain('knowledge_graph_sequence_guard')
    expect(transaction).not.toContain('setval(')
  })

  it('keeps active 051 proofs free of deleted objects', () => {
    const proofs = [
      readRepoFile('supabase/tests/051_privacy_backstop_proof.sql'),
      readRepoFile('supabase/tests/051_space_privacy_proof.sql'),
    ].join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '')
    expect(proofs).not.toContain(oldTable)
    expect(proofs).not.toContain(oldRpc)
  })
  it('keeps rejection evidence structurally unable to copy event content', () => {
    const sql = migration(), table = sql.match(/CREATE TABLE public\.knowledge_graph_backfill_rejections \(([\s\S]*?)\n\);/)?.[1] ?? '', writes = Array.from(sql.matchAll(/INSERT INTO public\.knowledge_graph_backfill_rejections[\s\S]*?;/g), (match) => match[0]).join('\n')
    expect(Array.from(table.matchAll(/^\s{2}([a-z][a-z0-9_]*)\s+/gm), (match) => match[1])).toEqual(['source_kind', 'source_id', 'reason', 'source_digest'])
    expect(writes).not.toMatch(/\b(?:to_jsonb|row_to_json|jsonb_agg|array_agg)\s*\(\s*[a-z][a-z0-9_]*\s*\)|\b[a-z][a-z0-9_]*\.(?:\*|content|metadata|source_ref)\b/)
  })
})
