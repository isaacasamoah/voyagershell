// The Room — a session's shared space participant set.
// sessions.space_id points at one spaces row; active space_members fan out.

import { getAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/debug'

const sessions = () => (getAdminClient() as unknown as { from: (t: string) => any }).from('sessions')
const spaces = () => (getAdminClient() as unknown as { from: (t: string) => any }).from('spaces')
const spaceMembers = () => (getAdminClient() as unknown as { from: (t: string) => any }).from('space_members')

export interface RoomState {
  roomPeople: string[] // user_ids
  aiPresent: boolean
}

export interface SessionRow {
  id: string
  user_id: string | null
  voyage_id: string | null
  space_id: string | null
}

interface SpaceRow {
  ai_present: boolean | null
}

interface SpaceMemberRow {
  user_id: string | null
}

const getSession = async (sessionId: string): Promise<SessionRow | null> => {
  const { data, error } = await sessions()
    .select('id, user_id, voyage_id, space_id')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) {
    log.api('room session lookup failed', { sessionId, error: error.message }, 'error')
    return null
  }
  return (data as SessionRow | null) ?? null
}

const activeMemberRows = (spaceId: string) =>
  spaceMembers()
    .select('user_id')
    .eq('space_id', spaceId)
    .eq('state', 'active')

const createSpaceForSession = async (
  session: SessionRow,
  aiPresent: boolean,
): Promise<string | null> => {
  const { data, error } = await spaces()
    .insert({
      kind: 'room',
      voyage_id: session.voyage_id,
      ai_present: aiPresent,
      created_by: session.user_id,
    })
    .select('id')
    .single()
  if (error || !data) {
    log.api('create room space failed', { sessionId: session.id, error: error?.message }, 'error')
    return null
  }

  const spaceId = (data as { id: string }).id
  const { error: updateError } = await sessions()
    .update({ space_id: spaceId })
    .eq('id', session.id)
  if (updateError) {
    log.api('link session room space failed', { sessionId: session.id, spaceId, error: updateError.message }, 'error')
    return null
  }

  session.space_id = spaceId
  return spaceId
}

export const ensureSpace = async (
  session: SessionRow,
  aiPresent: boolean,
): Promise<string | null> => session.space_id ?? createSpaceForSession(session, aiPresent)

export const activateMembers = async (spaceId: string, userIds: Array<string | null>): Promise<void> => {
  const rows = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))))
    .map((user_id) => ({ space_id: spaceId, user_id, state: 'active' }))
  if (rows.length === 0) return

  const { error } = await spaceMembers().upsert(rows, {
    onConflict: 'space_id,user_id',
  })
  if (error) log.api('activate room members failed', { spaceId, error: error.message }, 'error')
}

export const getRoom = async (sessionId: string): Promise<RoomState> => {
  const session = await getSession(sessionId)
  if (!session?.space_id) return { roomPeople: [], aiPresent: true }

  const [{ data: space, error: spaceError }, { data: members, error: memberError }] = await Promise.all([
    spaces().select('ai_present').eq('id', session.space_id).maybeSingle(),
    activeMemberRows(session.space_id),
  ])
  if (spaceError || memberError) {
    log.api('getRoom failed', {
      sessionId,
      spaceId: session.space_id,
      error: spaceError?.message ?? memberError?.message,
    }, 'error')
    return { roomPeople: [], aiPresent: true }
  }

  const roomPeople = ((members as SpaceMemberRow[] | null) ?? [])
    .map((member) => member.user_id)
    .filter((id): id is string => Boolean(id) && id !== session.user_id)
  const aiPresent = ((space as SpaceRow | null)?.ai_present) ?? true
  return { roomPeople, aiPresent }
}

export const removeRoomPerson = async (sessionId: string, userId: string): Promise<RoomState> => {
  const session = await getSession(sessionId)
  if (!session?.space_id) return { roomPeople: [], aiPresent: true }

  const { error } = await spaceMembers()
    .update({ state: 'left' })
    .eq('space_id', session.space_id)
    .eq('user_id', userId)
  if (error) log.api('removeRoomPerson failed', { spaceId: session.space_id, error: error.message }, 'error')
  return getRoom(sessionId)
}

export const setAiPresent = async (sessionId: string, present: boolean): Promise<void> => {
  const session = await getSession(sessionId)
  if (!session) return

  const spaceId = await ensureSpace(session, present)
  if (!spaceId) return

  const { error } = await spaces().update({ ai_present: present }).eq('id', spaceId)
  if (error) log.api('setAiPresent failed', { spaceId, error: error.message }, 'error')
}

export type RoomCommand =
  | { op: 'add' | 'remove'; name: string }
  | { op: 'voyager-in' | 'voyager-out' }

/** Deterministic `+`/`−` room grammar, parsed BEFORE the model so it can never
 *  be confabulated. `+vanessa` / `-vanessa` / `+voyager` / `-voyager`. Natural
 *  language ("add vanessa") still routes through the add_to_room tool. */
export const parseRoomCommand = (text: string): RoomCommand | null => {
  const t = text.trim()
  const m = /^([+\-])\s*([a-z0-9_][a-z0-9_ .'-]*)$/i.exec(t)
  if (!m) return null
  const sign = m[1]
  const name = m[2].trim()
  if (/^voyager$/i.test(name)) return { op: sign === '+' ? 'voyager-in' : 'voyager-out' }
  return { op: sign === '+' ? 'add' : 'remove', name }
}

// ── Room roster (code-attested truth for the model) ─────────────────────────
// The model must never guess room membership: this is injected into the turn
// context so "who's in the room" and invited-vs-joined are always honest.
export interface RoomRoster {
  active: string[]   // display names, excluding the session owner
  invited: string[]  // display names — knocked, NOT joined, cannot see messages
  aiPresent: boolean
}

export const getRoomRoster = async (sessionId: string): Promise<RoomRoster> => {
  const session = await getSession(sessionId)
  if (!session?.space_id) return { active: [], invited: [], aiPresent: true }

  const [{ data: space }, { data: members, error }] = await Promise.all([
    spaces().select('ai_present').eq('id', session.space_id).maybeSingle(),
    spaceMembers()
      .select('user_id, state, profiles:user_id (display_name, email)')
      .eq('space_id', session.space_id)
      .in('state', ['active', 'invited']),
  ])
  if (error) {
    log.api('getRoomRoster failed', { sessionId, error: error.message }, 'error')
    return { active: [], invited: [], aiPresent: true }
  }

  const rows = (members ?? []) as Array<{
    user_id: string | null
    state: string
    profiles: { display_name: string | null; email: string | null } | null
  }>
  const name = (r: (typeof rows)[number]) =>
    r.profiles?.display_name ?? r.profiles?.email ?? 'someone'
  const others = rows.filter((r) => r.user_id && r.user_id !== session.user_id)
  return {
    active: others.filter((r) => r.state === 'active').map(name),
    invited: others.filter((r) => r.state === 'invited').map(name),
    aiPresent: ((space as { ai_present: boolean | null } | null)?.ai_present) ?? true,
  }
}

/** The one honest line the model sees about the room, every turn. */
export const describeRoomForPrompt = (roster: RoomRoster): string => {
  if (roster.active.length === 0 && roster.invited.length === 0) return ''
  const parts: string[] = []
  if (roster.active.length > 0) parts.push(`in the room: ${roster.active.join(', ')}`)
  if (roster.invited.length > 0)
    parts.push(`invited but NOT joined (they cannot see these messages): ${roster.invited.join(', ')}`)
  return `\n[Room state (authoritative): ${parts.join('; ')}. Describe the room ONLY from this line — never from conversation history.]`
}
