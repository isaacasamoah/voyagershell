import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const authorityMigration = read('supabase/migrations/054_active_membership_authority.sql')
const creationMigration = read('supabase/migrations/056_room_invite_authority.sql')
const transitionMigration = read('supabase/migrations/057_room_invite_transition.sql')
const lifecycle = read('recipes/sql/room-invite-transition-assertions.sql')
const transition = transitionMigration.match(
  /CREATE FUNCTION public\.transition_room_invite\([\s\S]*?\n\$\$;/,
)?.[0] ?? ''
const creation = creationMigration.match(
  /CREATE FUNCTION public\.create_room_invite\([\s\S]*?\n\$\$;/,
)?.[0] ?? ''
const app = read('lib/messaging/invites.ts')
const route = read('app/api/room/invite/respond/route.ts')
const roomTools = read('lib/retrieval/voyager-room-tools.ts')
const toolRegistry = read('lib/retrieval/voyager-tools.ts')

describe('atomic room invite transition', () => {
  it('creates and re-invites through one locked database transition', () => {
    expect(creation).toMatch(/session\.user_id = p_inviter_user_id[\s\S]*FOR UPDATE/)
    expect(creation).toMatch(/voyage_members parent[\s\S]*FOR UPDATE/)
    expect(creation).toMatch(/space_members member[\s\S]*FOR UPDATE/)
    expect(creation).toContain("INSERT INTO public.spaces(voyage_id, created_by)")
    expect(creation).toMatch(/UPDATE public\.space_members[\s\S]*SET state = 'invited'/)
    expect(creation).toContain("RETURN QUERY SELECT 'invited'::text")
    expect(app).toContain("rpc('create_room_invite'")
    expect(app).not.toMatch(/from\(['"](?:sessions|spaces|space_members)['"]\)/)
    expect(app).not.toMatch(/ensureSpace|activateMembers|reinviteLeftMember|upsertMemberState/)
  })

  it('makes the session invariant trigger privilege-safe without losing caller-role checks', () => {
    expect(authorityMigration)
      .toMatch(/guard_session_authority_columns\(\)[\s\S]*SECURITY DEFINER/)
    expect(authorityMigration)
      .toContain("current_setting('role', true) IN ('anon', 'authenticated')")
    expect(authorityMigration)
      .toContain('REVOKE ALL ON FUNCTION public.guard_session_authority_columns()')
    expect(transitionMigration).not.toContain('guard_session_authority_columns')
  })

  it('locks the exact session, space, parent, and child authority before mutation', () => {
    expect(transition).toMatch(/session\.user_id = p_user_id[\s\S]*FOR UPDATE/)
    expect(transition).toContain('member.space_id = p_space_id')
    expect(transition).not.toContain('p_space_id IS NULL OR')
    expect(transition).not.toContain('space.created_at DESC')
    expect(transition).toMatch(/WHERE space\.id = v_space_id[\s\S]*FOR SHARE/)
    expect(transition).toMatch(/voyage_members parent[\s\S]*FOR UPDATE/)
    expect(transition).toMatch(/space_members member[\s\S]*FOR UPDATE/)
    expect(transition).toContain('public.is_effective_space_member(v_space_id, p_user_id)')
    expect(transition).toContain('p_user_id IS DISTINCT FROM auth.uid()')
  })

  it('returns success only after membership and session linkage execute in one function', () => {
    expect(transition).toMatch(/UPDATE public\.space_members[\s\S]*SET state = 'active'/)
    expect(transition).toMatch(/UPDATE public\.sessions[\s\S]*SET space_id = v_space_id/)
    expect(transition).toMatch(/RETURN QUERY[\s\S]*CASE WHEN v_member_state/)
    expect(transition.indexOf('UPDATE public.space_members'))
      .toBeLessThan(transition.indexOf('UPDATE public.sessions'))
    expect(transition.indexOf('UPDATE public.sessions'))
      .toBeLessThan(transition.lastIndexOf('RETURN QUERY'))
    const response = app.slice(app.indexOf('export const respondToRoomInvite'))
    expect(app).toContain("rpc('transition_room_invite'")
    expect(response).toMatch(/spaceId: string/)
    expect(response).not.toMatch(/spaceId: string \| null = null/)
    expect(response).toContain('await transitionRoomInvite')
    expect(response).not.toMatch(/from\(['"](?:space_members|sessions)['"]\)/)
  })

  it('records the room on the live conversation, never the session that rendered the knock', () => {
    // The knock survives /new, a resume, and a second tab, so the session id
    // the caller posts can already be historical. Binding it left both people
    // active members of a room neither could see.
    expect(transition).not.toMatch(
      /UPDATE public\.sessions\s+SET space_id = v_space_id\s+WHERE id = p_session_id/,
    )
    expect(transition).toMatch(
      /UPDATE public\.sessions\s+SET space_id = v_space_id\s+WHERE user_id = p_user_id\s+AND status = 'active'\s+AND voyage_id IS NOT DISTINCT FROM v_space\.voyage_id/,
    )
    // No live conversation means nowhere for the room to become visible, so
    // the membership flip rolls back rather than half-committing.
    expect(transition).toContain('room_invite_live_session_missing')
    // Which conversation is live is decided under the same (user, voyage) key
    // get_or_create_active_session and resume_session hold.
    expect(transition).toMatch(
      /pg_advisory_xact_lock[\s\S]*coalesce\(v_session\.voyage_id::text, 'personal'\)/,
    )
    expect(transition.indexOf('pg_advisory_xact_lock'))
      .toBeLessThan(transition.indexOf('FOR UPDATE'))
    expect(lifecycle).toContain('rejoin did not bind the live session')
    expect(lifecycle).toContain('rejoin spread the room across historical sessions')
    expect(lifecycle).toContain('accept without a live session was allowed')
  })

  it('announces only a committed invited-to-active result and preserves denial reason', () => {
    expect(route).toContain("response.transition === 'accepted'")
    expect(route).toContain('respondToRoomInvite(conversationId, auth, accept, spaceId)')
    expect(route).toContain('{ status: 409 }')
    expect(route).toContain('await announceJoin')
    expect(route).toContain('reason: response.reason')
    expect(route.indexOf('await respondToRoomInvite')).toBeLessThan(route.indexOf('await announceJoin'))
  })

  it('keeps the displayed exact-space endpoint as the only response path', () => {
    expect(route).toContain('valid conversationId and spaceId required')
    expect(roomTools).not.toContain('respond_to_room_invite')
    expect(roomTools).not.toContain('respondToRoomInvite')
    expect(toolRegistry).not.toContain('respond_to_room_invite')
  })
})
