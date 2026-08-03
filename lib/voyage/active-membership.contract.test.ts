import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const membershipSql = (): string => read('supabase/migrations/054_active_membership_authority.sql')
const retrievalSql = (): string => read('supabase/migrations/055_active_knowledge_retrieval.sql')
const functionBody = (sql: string, name: string): string => sql.match(new RegExp(
  `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\([\\s\\S]*?\\s+\\$\\$;`,
))?.[0] ?? ''

describe('active voyage membership clean transition', () => {
  it('replaces every voyage authority surface with active-only semantics', () => {
    const sql = membershipSql()
    for (const name of [
      'is_voyage_captain_by_id', 'is_voyage_captain', 'get_voyage_role',
      'get_user_voyages', 'regenerate_voyage_invite', 'join_voyage_by_code',
    ]) expect(functionBody(sql, name)).toContain("state = 'active'")
    expect(retrievalSql()).toContain("member.state = 'active'")
    const scope = functionBody(retrievalSql(), 'knowledge_in_scope')
    expect(scope).toContain("member.state = 'active'")
    expect(scope).toContain('auth.uid() = p_user_id')
    expect(scope.split('AS $$')[1]).not.toContain('p_participants')
    expect(read('supabase/migrations/051_privacy_rls_backstop.sql'))
      .toMatch(/graph_traverse[\s\S]*knowledge_in_scope/)
    expect([
      read('supabase/migrations/056_room_invite_authority.sql'),
      read('supabase/migrations/057_room_invite_transition.sql'),
    ].join('\n'))
      .toMatch(/voyage_members[\s\S]*parent\.state = 'active'/)
    expect(sql).toContain("state = 'active' AND public.is_active_voyage_member_by_id(voyage_id)")
    expect(sql).toMatch(/join_voyage_by_code\(text, uuid\)[\s\S]*FROM PUBLIC, anon/)
    expect(sql).toMatch(/join_voyage_by_code\(text, uuid\)[\s\S]*TO authenticated, service_role/)
  })

  it('reactivates one retained row as crew and lets authority triggers version it', () => {
    const sql = membershipSql()
    const join = functionBody(sql, 'join_voyage_by_code')
    const regenerate = functionBody(sql, 'regenerate_voyage_invite')
    expect(join).toContain('SELECT * INTO v_member')
    expect(join).toContain('FOR UPDATE')
    expect(join).toContain("SET state = 'active', role = 'crew' WHERE id = v_member.id")
    expect(join).not.toMatch(/ELSIF[\s\S]*INSERT INTO public\.voyage_members/)
    expect(join).toContain('p_user_id IS DISTINCT FROM auth.uid()')
    expect(regenerate).toContain('p_user_id IS DISTINCT FROM auth.uid()')
    const app = read('lib/voyage/invitations.ts')
    expect(app).toContain(".select('id, state')")
    expect(app).toContain("update({ state: 'active', role: 'crew' }).eq('id', existingMember.id)")
  })

  it('puts every knowledge retrieval RPC behind one honest active-member boundary', () => {
    const sql = retrievalSql()
    const authorization = functionBody(sql, 'authorize_knowledge_scope')
    const targetCatalog = read('recipes/sql/knowledge-graph/catalog-targets.sql')
    expect(authorization).toContain('auth.uid()')
    expect(authorization).toContain("member.state = 'active'")
    expect(authorization).toContain('p_user_id IS DISTINCT FROM v_caller')
    for (const name of ['search_knowledge', 'keyword_search', 'scoped_knowledge_fetch']) {
      const body = functionBody(sql, name)
      expect(body).toContain(`authorize_knowledge_scope('${name}'`)
      expect(body).toContain('ARRAY[p_user_id]::uuid[]')
      expect(body).toContain('SECURITY DEFINER SET search_path = pg_catalog, public')
    }
    for (const name of ['get_knowledge_by_ids', 'get_voyage_messages', 'graph_traverse']) {
      const body = functionBody(sql, name)
      expect(body).toContain(`authorize_knowledge_scope('${name}'`)
      expect(body).toContain('knowledge_in_scope')
      expect(body).toContain('SECURITY DEFINER SET search_path = pg_catalog, public')
    }
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.keyword_search\([\s\S]*?uuid\[\]\);/)
    expect(sql).toContain('search_knowledge(vector, uuid, text, boolean, text[], double precision')
    expect(sql).toContain(
      'public.keyword_search(text, uuid, text, text, double precision, integer, uuid[]);',
    )
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.scoped_knowledge_fetch\(\s*uuid, text, uuid\[\], text, text, boolean, timestamptz, timestamptz, double precision, integer\);/)
    expect(sql.match(/CREATE (?:OR REPLACE )?FUNCTION public\.scoped_knowledge_fetch/g)).toHaveLength(1)
    expect(functionBody(sql, 'scoped_knowledge_fetch')).toContain('p_sender_user_id uuid')
    expect(functionBody(sql, 'keyword_search')).not.toContain('connected_to')
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.knowledge_in_scope[\s\S]*public\.authorize_knowledge_scope[\s\S]*service_role/)
    expect(targetCatalog).toContain("'authorize_knowledge_scope'")
    expect(targetCatalog).not.toContain("'keyword_search'")
    expect(targetCatalog).not.toContain("'scoped_knowledge_fetch'")
    for (const name of ['search_knowledge', 'keyword_search', 'scoped_knowledge_fetch']) {
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION[\\s\\S]*?public\\.${name}\\([\\s\\S]*?TO authenticated, service_role;`))
    }
    expect(sql).toMatch(/get_knowledge_by_ids\(uuid\[\], uuid, text\)[\s\S]*graph_traverse\([\s\S]*TO service_role;/)
  })

  it('resolves vector distance without widening any definer search path', () => {
    const sql = retrievalSql()
    const functionNames = Array.from(sql.matchAll(
      /CREATE (?:OR REPLACE )?FUNCTION public\.([a-z_]+)\(/g,
    ), (match) => match[1])
    const search = functionBody(sql, 'search_knowledge')
    expect(search).toContain('SECURITY DEFINER SET search_path = pg_catalog, public')
    // Qualify to the schema migration 002 actually installs pgvector into. Its
    // bare `CREATE EXTENSION IF NOT EXISTS vector` lands the operators in
    // `public` on every real Voyager database; `extensions` exists but is empty
    // of them, so the earlier `OPERATOR(extensions.<=>)` raised 42883 at runtime
    // and semantic search silently returned nothing. `public` is already in the
    // definer path, so this stays explicit without widening anything.
    expect(search.match(/OPERATOR\(public\.<=>\)/g)).toHaveLength(3)
    expect(search.replaceAll('OPERATOR(public.<=>)', '')).not.toContain('<=>')
    for (const name of functionNames) {
      const body = functionBody(sql, name)
      expect(body.match(/SET search_path/g)).toHaveLength(1)
      expect(body).toContain('SECURITY DEFINER SET search_path = pg_catalog, public')
    }
    expect(sql.match(/SET search_path/g)).toHaveLength(functionNames.length)
    expect(sql.match(
      /SECURITY DEFINER SET search_path = pg_catalog, public AS \$\$/g,
    )).toHaveLength(functionNames.length)
  })

  it('authorizes the deployed graph root and every bounded frontier node', () => {
    const body = functionBody(retrievalSql(), 'graph_traverse')
    const rootCheck = body.indexOf('root.event_id = p_node_id')
    const traversal = body.indexOf('WHILE v_hop')
    expect(rootCheck).toBeGreaterThan(-1)
    expect(rootCheck).toBeLessThan(traversal)
    expect(body).toContain('node.event_id <> ALL(v_seen)')
    expect(body).toContain('knowledge_in_scope(node.user_id')
    expect(body).toContain('LIMIT v_remaining')
    expect(body).toContain('v_remaining := v_remaining - 1')
    expect(body).toContain('v_seen := array_append')
    expect(body).not.toContain('WITH RECURSIVE traversal')
  })

  it('proves left, forged, personal, rejoined, and overload-clean retrieval behavior', () => {
    const assertions = read('lib/knowledge/kernel/active-membership-assertions-sql.ts')
    for (const marker of [
      'knowledge_graph_left_member_search_accepted',
      'knowledge_graph_left_member_keyword_accepted',
      'knowledge_graph_left_member_scoped_accepted',
      'knowledge_graph_forged_search_user_accepted',
      'knowledge_graph_forged_keyword_user_accepted',
      'knowledge_graph_forged_scoped_user_accepted',
      'knowledge_graph_left_member_admin_search_accepted',
      'knowledge_graph_left_member_admin_keyword_accepted',
      'knowledge_graph_left_member_admin_scoped_accepted',
      'knowledge_graph_left_member_legacy_graph_scope_accepted',
      'knowledge_graph_rejoined_domain_scope_denied',
      'knowledge_graph_rejoined_preference_scope_leaked',
      'knowledge_graph_scoped_overload_residue',
    ]) expect(assertions).toContain(marker)
    expect(assertions).toContain("public.keyword_search('K1', ${uuid(seed.recipientId)}, NULL)")
  })

  it('routes every admin-backed retrieval caller through the hardened RPCs', () => {
    const callers: Array<[string, string[]]> = [
      ['lib/knowledge/curator.ts', ["('scoped_knowledge_fetch'", 'p_user_id: userId']],
      ['lib/retrieval/temporal-retrieval-tool.ts', ['temporalUnitSearch(', 'ctx.userId']],
      ['lib/knowledge/search.ts', ['semanticUnitSearch(', 'userId, query']],
      ['lib/knowledge/unit-search.ts', ["'search_knowledge_units'",
        "'keyword_search_units'", 'p_viewer_profile_id: viewerProfileId']],
    ]
    for (const [path, fragments] of callers) {
      const source = read(path)
      for (const fragment of fragments) expect(source).toContain(fragment)
      expect(source).not.toContain('voyage_members')
    }
  })

  it('filters every app membership-derived audience at its shared boundary', () => {
    const voyage = read('lib/voyage/members.ts')
    const credentials = read('lib/models/connections.ts')
    expect(voyage).toContain('sessionAuthority.getLastActiveVoyageSlug')
    expect(voyage).toMatch(/voyage_members[\s\S]*\.eq\('state', 'active'\)/)
    expect(read('supabase/migrations/059_session_authority_cleanup.sql')).toMatch(
      /get_last_active_voyage_slug[\s\S]*member\.state = 'active'/,
    )
    expect(credentials).toMatch(/voyage_members[\s\S]*\.eq\('state', 'active'\)/)
    for (const path of [
      'lib/harness/room-turn.ts', 'lib/retrieval/tool-helpers.ts',
      'lib/retrieval/voyager-message-command-tools.ts', 'lib/retrieval/voyager-room-tools.ts',
      'lib/shell/reconciliation-fallbacks.ts', 'app/api/voyages/[slug]/members/route.ts',
    ]) expect(read(path)).toContain('getVoyageMembers')
    for (const path of ['app/api/chat/route.ts', 'app/api/room/route.ts']) {
      expect(read(path)).toContain('resolveSessionVoyage')
    }
    expect(read('lib/messaging/feed-enrichment.ts')).toContain("'is_effective_space_member'")
  })

  it('tracks membership state and revision in domain and installed-schema contracts', () => {
    const domain = read('lib/voyage/types.ts')
    const installed = read('lib/supabase/schema/product-tables.ts')
    expect(domain).toContain("state: 'active' | 'left'")
    expect(domain).toContain('state_changed_at: string')
    expect(domain).toContain('revision: number')
    // Supabase generation maps text CHECK constraints to string. The narrower
    // application vocabulary remains in the domain contract above.
    expect(installed).toMatch(/type VoyageMember = \{[\s\S]*state: string;/)
    expect(installed).toMatch(/type SpaceMember = \{[\s\S]*state: string;/)
    expect(installed).toContain('state_changed_at: string')
    expect(installed).toContain('revision: number')
  })
})
