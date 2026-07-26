import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('session authority concurrency recipe', () => {
  it('proves membership and lifecycle commit orders against the installed boundary', () => {
    const recipe = read('recipes/session-authority-concurrency.sh')
    const migration = read('supabase/migrations/059_session_authority_cleanup.sql')
    for (const fragment of [
      'supabase/migrations/054_active_membership_authority.sql',
      'supabase/migrations/059_session_authority_cleanup.sql',
      'SET LOCAL ROLE service_role',
      'room-rpc-first',
      'space-leave-second',
      'space-leave-first',
      'session-rpc-second',
      'resume-a-first',
      'resume-b-second',
      'resume-b-first',
      'resume-a-second',
      'resume-first',
      'get-second',
      'get-first',
      'resume-second',
      'pg_blocking_pids(c.pid)',
      'session_access_denied',
      'SESSION_AUTHORITY_CONCURRENCY_GREEN',
    ]) expect(recipe).toContain(fragment)
    expect(recipe.match(/lifecycle_overlap (resume|get)/g)).toHaveLength(4)
    expect(recipe).toContain("count(*) FILTER (WHERE status='active')=1")
    expect(recipe.match(/public\.set_session_ai_presence\(/g)).toHaveLength(2)
    expect(recipe).toContain('[ "$after" = "$before" ]')
    expect(migration).toContain('FOR SHARE OF space, member')
    expect(migration).toContain('AND member.state = \'active\' FOR SHARE')
  })

  it('serializes every active-set mutator with the same user-voyage lock key', () => {
    const migration = read('supabase/migrations/059_session_authority_cleanup.sql')
    const lock = 'pg_advisory_xact_lock(pg_catalog.hashtextextended('
    const key = "p_user_id::text || ':' || coalesce(v_voyage_id::text, 'personal'), 0)"
    expect(migration.split(lock)).toHaveLength(4)
    expect(migration.split(key)).toHaveLength(4)
    for (const [name, activeSet] of [
      ['get_or_create_active_session', "session.status = 'active'"],
      ['resume_session', "session.status = 'active'"],
      ['archive_session', "SET status = 'historical'"],
    ]) {
      const body = migration.slice(
        migration.indexOf(`CREATE FUNCTION public.${name}`),
        migration.indexOf('END $$;', migration.indexOf(`CREATE FUNCTION public.${name}`)),
      )
      expect(body.indexOf(lock)).toBeGreaterThan(0)
      expect(body.indexOf(lock)).toBeLessThan(body.indexOf(activeSet))
    }
  })

  it('uses one isolated pinned-image container with fail-closed cleanup', () => {
    const recipe = read('recipes/session-authority-concurrency.sh')
    for (const fragment of [
      '--pull=never',
      '--network none',
      'trap cleanup EXIT',
      'docker_proof_cleanup "$CONTAINER_NAME" "$PIDS"',
      'ON_ERROR_STOP=1',
    ]) expect(recipe).toContain(fragment)
    expect(recipe).not.toContain('docker pull')
    expect(recipe).not.toContain('--publish')
  })
})
