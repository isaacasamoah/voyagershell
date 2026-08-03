import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PublicFunctions } from '@/lib/supabase/schema/functions'

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const databaseTypes = (): string => [
  'lib/supabase/types.ts', 'lib/supabase/schema/base.ts', 'lib/supabase/schema/functions.ts',
  'lib/supabase/schema/knowledge-tables.ts', 'lib/supabase/schema/operational-tables.ts',
  'lib/supabase/schema/product-tables.ts',
].map(read).join('\n')

describe('K1 database boundaries', () => {
  it('preserves the generated schema-aware type helper boundary', () => {
    const types = read('lib/supabase/types.ts')
    for (const helper of [
      'export type Tables<',
      'export type TablesInsert<',
      'export type TablesUpdate<',
      'export type Enums<',
      'export type CompositeTypes<',
    ]) expect(types).toContain(helper)
    expect(types).toContain('{ schema: keyof DatabaseWithoutInternals }')
  })

  it('drops every dead session mutation signature and seals catalogue residue', () => {
    const cleanup = read('supabase/migrations/059_session_authority_cleanup.sql')
    for (const signature of [
      'transition_session(uuid, public.session_status)',
      'mark_session_extracted(uuid)',
      'set_session_title(uuid, text)',
    ]) expect(cleanup).toContain(`DROP FUNCTION IF EXISTS public.${signature};`)

    const assertions = [
      read('recipes/sql/installed-authority-assertions.sql'),
      read('recipes/sql/installed-catalogue-assertions.sql'),
    ].join('\n')
    for (const name of [
      'transition_session', 'mark_session_extracted', 'set_session_title',
      'search_memories', 'supersede_memory', 'get_or_create_active_session',
      'get_resumable_sessions', 'create_knowledge_event',
    ]) expect(assertions).toContain(`'${name}'`)
    for (const name of [
      'transition_session:', 'mark_session_extracted:', 'set_session_title:',
    ]) expect(databaseTypes()).not.toContain(name)
  })

  it('keeps the graph contract exact through the cutover', () => {
    const source = [
      read('lib/knowledge/kernel/candidate-schema.ts'),
      read('lib/knowledge/kernel/candidate-schema-tables.ts'),
    ].join('\n')
    for (const name of [
      'knowledge_audiences:', 'knowledge_units:', 'graph_nodes:', 'graph_node_grants:',
      'graph_edges:', 'graph_edge_evidence:', 'graph_authority_edges:',
      'knowledge_graph_backfill_rejections:', 'retrieve_knowledge_graph_claims:',
      'traverse_knowledge_graph:', 'knowledge_audience_id:',
    ]) expect(source).toContain(name)
    expect(source).toContain('CANDIDATE_SCHEMA_FILES = [57, 58, 59, 60, 61, 62, 63]')
  })

  // The cutover dropped the legacy table and RPC, so the installed types must
  // stop describing them — a type for a table that no longer exists is a lie a
  // future caller can compile against.
  it('describes the post-cutover database and no legacy graph surface', () => {
    const live = [
      read('lib/retrieval/knowledge-retrieval-tools.ts'),
    ].join('\n')
    expect(live).not.toContain("rpc('graph_traverse'")
    expect(live).not.toContain('createEdge(')
    expect(live).not.toContain('writeKnowledgeGraphEdge')
    expect(live).toContain('retrieveKnowledgeGraphClaims')
    const types = databaseTypes()
    expect(types).not.toMatch(/rpc as Function|as unknown as \{ rpc/)
    expect(types).not.toContain('knowledge_edges:')
    expect(types).not.toContain('graph_traverse:')
    expect(types).not.toContain('writeKnowledgeGraphEdge')
    expect(types).toContain('claim_source_message_ingress:')
    expect(types).toContain('complete_knowledge_extraction_attempt:')
  })

  it('does not expose a numeric migration range as installed-state authority', () => {
    const types = read('lib/supabase/types.ts')
    expect(types).not.toContain('INSTALLED_SCHEMA_MIGRATION_END')
    expect(types).not.toContain('INSTALLED_PUBLIC_TABLES')
    expect(types).not.toContain('INSTALLED_PUBLIC_FUNCTIONS')
  })

  it('keeps the generated membership identity callable by server writes', () => {
    const migration = read('supabase/migrations/059_session_authority_cleanup.sql')
    const postcondition = read('recipes/sql/installed-post-059-contract.sql')
    const assertions = [
      read('recipes/sql/installed-authority-assertions.sql'),
      read('recipes/sql/installed-catalogue-assertions.sql'),
    ].join('\n')
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.canonical_space_member_id\(uuid, uuid\)[\s\S]*TO service_role/,
    )
    expect(postcondition).toContain(
      "('canonical_space_member_id', 'uuid, uuid'",
    )
    expect(assertions).toContain("ARRAY['canonical_space_member_id'")
    expect(assertions).toContain('SET ROLE service_role')
    expect(assertions).toContain('INSERT INTO public.space_members')
    expect(assertions).toContain('installed_space_member_identity_mismatch')
  })

  it('keeps voyage preferences private and nullable RPC outcomes honest', () => {
    const retrieval = read('supabase/migrations/055_active_knowledge_retrieval.sql')
    const assertions = [
      read('recipes/sql/installed-authority-assertions.sql'),
      read('lib/knowledge/kernel/active-membership-assertions-sql.ts'),
    ].join('\n')
    expect(retrieval).toContain(
      "p_row_event_type = 'explicit' AND p_row_knowledge_type IN ('domain', 'operational')",
    )
    expect(assertions).toContain('installed_member_preference_leaked')
    expect(assertions).toContain('knowledge_graph_rejoined_preference_scope_leaked')

    const deniedInvite: PublicFunctions['create_room_invite']['Returns'][number] = {
      invite_status: 'denied',
      invite_space_id: null,
    }
    const noPending: PublicFunctions['transition_room_invite']['Returns'][number] = {
      transition_status: 'no_pending_invite',
      transition_space_id: null,
    }
    expect(deniedInvite.invite_space_id).toBeNull()
    expect(noPending.transition_space_id).toBeNull()
  })
})
