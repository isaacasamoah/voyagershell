import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const recipe = readFileSync(resolve(process.cwd(),
  'recipes/room-invite-authority-concurrency.sh'), 'utf8')
const lifecycle = readFileSync(resolve(process.cwd(),
  'recipes/sql/room-invite-transition-assertions.sql'), 'utf8')

describe('room invite authority concurrency recipe', () => {
  it('uses one disposable preconditioned installed-state database', () => {
    expect(recipe).toContain('pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee')
    expect(recipe).toContain('--pull=never')
    expect(recipe).toContain('--network none')
    expect(recipe).toContain('docker_proof_cleanup "$CONTAINER_NAME" "$PIDS"')
    expect(recipe).toContain('054_active_membership_authority.sql')
    expect(recipe).toContain('056_room_invite_authority.sql')
    expect(recipe).toContain('057_room_invite_transition.sql')
    expect(recipe).toContain('docker_proof_install_pre054')
    expect(recipe).not.toContain('knowledge_graph_schema.sql')
  })

  it('runs genuinely overlapping accept/decline and parent-leave orders', () => {
    for (const app of ['accept-first', 'decline-second', 'decline-first', 'accept-second',
      'accept-before-leave', 'leave-after-accept', 'leave-first', 'accept-after-leave']) {
      expect(recipe).toContain(app)
    }
    expect(recipe).toContain('pg_blocking_pids(pid)')
    expect(recipe).toContain('wait_event_type=\'Lock\'')
    expect(recipe).toContain('SELECT pg_sleep(3)')
    expect(recipe).not.toMatch(
      /transition_room_invite\([\s\S]{0,180}\bNULL,\s*'\$action'/,
    )
    expect(recipe).toMatch(/<<SQL &\nBEGIN;/)
    expect(recipe.match(/run_transition (?:accept|decline)/g)?.length).toBeGreaterThanOrEqual(6)
    expect(recipe.match(/<<'SQL' &/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('asserts committed results, session links, child deactivation, and re-entry', () => {
    for (const verdict of ['accepted', 'declined', 'no_pending_invite', 'denied', 'entered']) {
      expect(recipe).toContain(verdict)
    }
    expect(recipe).toContain('assert_state left NULL leave-first')
    expect(recipe).toContain("UPDATE space_members SET state='active'")
    expect(recipe).toContain('ROOM_INVITE_AUTHORITY_CONCURRENCY_GREEN')
  })

  it('proves first invite, both idempotent states, and re-invite in SQL', () => {
    expect(recipe).toContain('room-invite-transition-assertions.sql')
    expect(recipe.match(/room-invite-transition-assertions\.sql/g)).toHaveLength(1)
    expect(recipe.indexOf('room-invite-transition-assertions.sql'))
      .toBeGreaterThan(recipe.indexOf('INSERT INTO public.sessions'))
    for (const failure of [
      'forged inviter identity was accepted',
      'first invite did not commit an invited membership',
      'missing room identity selected a pending invite',
      'invited re-invite was not idempotent',
      'active re-invite was not idempotent',
      'left member was not re-invited in place',
    ]) {
      expect(lifecycle).toContain(failure)
    }
    expect(lifecycle).toContain("UPDATE public.space_members SET state = 'active'")
    expect(lifecycle).toContain("UPDATE public.space_members SET state = 'left'")
  })
})
