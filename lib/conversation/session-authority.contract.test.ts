import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const runtimeFiles = (directory: string): string[] => readdirSync(resolve(process.cwd(), directory))
  .flatMap((name) => {
    const path = `${directory}/${name}`
    return statSync(resolve(process.cwd(), path)).isDirectory()
      ? runtimeFiles(path)
      : [path]
  })
  .filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path))

const internalFunctions = [
  'authorize_session_scope', 'authorize_session_room_capability',
]
const sessionFunctions = [
  'get_session_scope',
  'get_or_create_active_session', 'get_resumable_sessions',
  'resume_session', 'archive_session', 'touch_session_activity',
  'get_last_active_voyage_slug', 'set_session_ai_presence',
  'remove_session_room_member',
]

describe('session authority clean transition', () => {
  it('has zero runtime direct sessions-table access', () => {
    const runtime = [...runtimeFiles('app'), ...runtimeFiles('lib')]
      .map((path) => `${path}\n${read(path)}`)
      .join('\n')
    expect(runtime).not.toMatch(/\.from\(\s*['"]sessions['"]\s*\)/)
    expect(runtime).not.toMatch(/getAdminClient\(\)\.from\(\s*['"]sessions['"]\s*\)/)
  })

  it('routes every session operation through one typed authority client', () => {
    const client = read('lib/conversation/session-authority.ts')
    const types = read('lib/supabase/schema/functions.ts')
    for (const name of sessionFunctions) {
      expect(types).toContain(`${name}:`)
      expect(client).toContain(`rpc('${name}'`)
    }
    expect(read('app/api/conversation/route.ts')).not.toContain('getVoyageBySlug')
    expect(read('lib/conversation/session-lifecycle.ts'))
      .not.toContain("from '@/lib/supabase/admin'")
  })

  it('pins exact service-only ACL, search_path, and installed application proof', () => {
    const migration = read('supabase/migrations/059_session_authority_cleanup.sql')
    const contract = read('recipes/sql/installed-post-059-contract.sql')
    const recipe = read('recipes/installed-schema-authority.sh')
    const application = read('recipes/sql/installed-session-application-assertions.sql')
    const client = read('lib/conversation/session-authority.ts')
    for (const name of [...internalFunctions, ...sessionFunctions]) {
      expect(migration).toContain(`public.${name}`)
      expect(contract).toContain(`'${name}'`)
    }
    const internalRevoke = migration.slice(
      migration.indexOf('REVOKE ALL ON FUNCTION public.authorize_session_scope'),
      migration.indexOf('REVOKE ALL ON FUNCTION public.get_session_scope'),
    )
    const ownedScope = migration.slice(
      migration.indexOf('CREATE FUNCTION public.authorize_session_scope'),
      migration.indexOf('CREATE FUNCTION public.authorize_session_room_capability'),
    )
    const roomScope = migration.slice(
      migration.indexOf('CREATE FUNCTION public.authorize_session_room_capability'),
      migration.indexOf('CREATE FUNCTION public.get_session_scope'),
    )
    for (const name of internalFunctions) {
      expect(internalRevoke).toContain(`public.${name}`)
      expect(client).not.toContain(`rpc('${name}'`)
    }
    expect(internalRevoke).toContain('service_role')
    expect(ownedScope).not.toContain('space_members')
    expect(roomScope).toContain('space_members')
    expect(migration).toMatch(
      /CREATE FUNCTION public\.set_session_ai_presence[\s\S]*?authorize_session_room_capability/,
    )
    expect(migration).toMatch(
      /CREATE FUNCTION public\.remove_session_room_member[\s\S]*?authorize_session_room_capability/,
    )
    expect(migration).toContain('SET search_path = pg_catalog, public')
    expect(contract).toContain("ARRAY['search_path=pg_catalog, public']::text[]")
    expect(migration).toContain('REVOKE ALL ON TABLE public.sessions FROM service_role')
    expect(recipe).toContain('installed-session-application-assertions.sql')
    expect(recipe).toContain('INSTALLED_SESSION_APPLICATION_CALL_GREEN')
    expect(application).toContain('installed_application_direct_session_read_accepted')
    expect(application).toContain('installed_application_left_voyage_scope_accepted')
    expect(application).toContain('installed_application_left_space_scope_denied')
    expect(application).toContain('installed_application_left_space_room_mutation_accepted')
  })
})
