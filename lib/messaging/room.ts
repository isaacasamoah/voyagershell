// The Room — a session's shared space participant set.
// sessions.space_id points at one spaces row; active space_members fan out.

import { getAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/debug'

const sessions = () => (getAdminClient() as unknown as { from: (t: string) => any }).from('sessions')
const spaces = () => (getAdminClient() as unknown as { from: (t: string) => any }).from('spaces')
const spaceMembers = () => (getAdminClient() as unknown as { from: (t: string) => any }).from('space_members')
const profiles = () => (getAdminClient() as unknown as { from: (t: string) => any }).from('profiles')

export interface RoomState {
  roomPeople: string[] // user_ids
  aiPresent: boolean
}

export interface DisplayRoomState {
  people: string[]
  aiPresent: boolean
}

export interface RemoveRoomPersonResult {
  removed: boolean
  room: RoomState
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

export const isActiveSpaceMember = async (spaceId: string, userId: string): Promise<boolean> => {
  const { data, error } = await spaceMembers()
    .select('user_id')
    .eq('space_id', spaceId)
    .eq('user_id', userId)
    .eq('state', 'active')
    .maybeSingle()
  if (error) {
    log.api('active room membership check failed', { spaceId, userId, error: error.message }, 'error')
    return false
  }
  return Boolean(data)
}

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

// Every ACTIVE member of the session's room, INCLUDING the session owner —
// recomputed fresh for explicit human sends and Share-to-room. Returns the
// caller when the session has no space yet.
export const getActiveMemberIds = async (
  sessionId: string,
  callerFallback: string,
): Promise<string[]> => {
  const session = await getSession(sessionId)
  if (!session?.space_id) return [callerFallback]

  const { data: members, error } = await activeMemberRows(session.space_id)
  if (error) {
    log.api('getActiveMemberIds failed', { sessionId, error: error.message }, 'error')
    return [callerFallback]
  }
  const ids = ((members as SpaceMemberRow[] | null) ?? [])
    .map((member) => member.user_id)
    .filter((id): id is string => Boolean(id))
  // sessions.space_id locates a room; it is never an authorization grant.
  // A removed member keeps the pointer for history/re-invitation, but cannot
  // send or share into the room unless their membership row is active now.
  if (session.user_id !== callerFallback || !ids.includes(callerFallback)) {
    return [callerFallback]
  }
  return ids
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

  const activeIds = ((members as SpaceMemberRow[] | null) ?? [])
    .map((member) => member.user_id)
    .filter((id): id is string => Boolean(id))
  // Fail closed when the session owner has left. The stale session pointer is
  // retained as location/history only and must not preserve room capability.
  if (!session.user_id || !activeIds.includes(session.user_id)) {
    return { roomPeople: [], aiPresent: true }
  }

  const roomPeople = activeIds.filter((id) => id !== session.user_id)
  const aiPresent = ((space as SpaceRow | null)?.ai_present) ?? true
  return { roomPeople, aiPresent }
}

export const getDisplayRoom = async (sessionId: string): Promise<DisplayRoomState> => {
  const room = await getRoom(sessionId)
  if (room.roomPeople.length === 0) return { people: [], aiPresent: room.aiPresent }

  const { data, error } = await profiles()
    .select('id, display_name')
    .in('id', room.roomPeople)
  if (error) {
    log.api('room profile lookup failed', { sessionId, error: error.message }, 'error')
    return { people: room.roomPeople.map(() => 'someone'), aiPresent: room.aiPresent }
  }
  const byId = new Map(((data ?? []) as Array<{ id: string; display_name: string | null }>)
    .map((profile) => [profile.id, profile.display_name]))
  return {
    people: room.roomPeople.map((id) => byId.get(id) ?? 'someone'),
    aiPresent: room.aiPresent,
  }
}

export const removeRoomPerson = async (
  sessionId: string,
  userId: string,
): Promise<RemoveRoomPersonResult> => {
  const session = await getSession(sessionId)
  if (!session?.space_id || !session.user_id) {
    return { removed: false, room: { roomPeople: [], aiPresent: true } }
  }

  if (!await isActiveSpaceMember(session.space_id, session.user_id)) {
    return { removed: false, room: { roomPeople: [], aiPresent: true } }
  }

  const { data: removedRows, error } = await spaceMembers()
    .update({ state: 'left' })
    .eq('space_id', session.space_id)
    .eq('user_id', userId)
    .eq('state', 'active')
    .select('user_id')
  if (error) log.api('removeRoomPerson failed', { spaceId: session.space_id, error: error.message }, 'error')
  return {
    removed: !error && ((removedRows as SpaceMemberRow[] | null) ?? []).length > 0,
    room: await getRoom(sessionId),
  }
}

export const setAiPresent = async (sessionId: string, present: boolean): Promise<boolean> => {
  const session = await getSession(sessionId)
  if (!session?.user_id) return false

  if (session.space_id && !await isActiveSpaceMember(session.space_id, session.user_id)) {
    return false
  }

  const hadSpace = Boolean(session.space_id)
  const spaceId = await ensureSpace(session, present)
  if (!spaceId) return false
  // Creating the space establishes its owner membership synchronously.
  if (!hadSpace) await activateMembers(spaceId, [session.user_id])

  const { error } = await spaces().update({ ai_present: present }).eq('id', spaceId)
  if (error) log.api('setAiPresent failed', { spaceId, error: error.message }, 'error')
  return !error
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
  if (!session?.space_id || !session.user_id) {
    return { active: [], invited: [], aiPresent: true }
  }

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
  // Prompt context is a read of room authority too. A stale session pointer
  // must not let a removed person ask their Voyager to reveal the current
  // members or pending invites in the room they left.
  const callerIsActive = rows.some((row) => (
    row.user_id === session.user_id && row.state === 'active'
  ))
  if (!callerIsActive) return { active: [], invited: [], aiPresent: true }

  const others = rows.filter((r) => r.user_id && r.user_id !== session.user_id)
  return {
    active: others.filter((r) => r.state === 'active').map(name),
    invited: others.filter((r) => r.state === 'invited').map(name),
    aiPresent: ((space as { ai_present: boolean | null } | null)?.ai_present) ?? true,
  }
}

/** The one honest line the model sees about the room, every turn. */
export const describeRoomForPrompt = (roster: RoomRoster): string => {
  if (roster.active.length === 0 && roster.invited.length === 0) {
    return '\n[Room state (authoritative): no other people are in this room and no invitations are pending. Describe the current room ONLY from this line — never infer current membership from conversation history.]'
  }
  const parts: string[] = []
  if (roster.active.length > 0) parts.push(`in the room: ${roster.active.join(', ')}`)
  if (roster.invited.length > 0)
    parts.push(`invited but NOT joined (they cannot see these messages): ${roster.invited.join(', ')}`)
  return `\n[Room state (authoritative): ${parts.join('; ')}. Describe the current room ONLY from this line — never infer current membership from conversation history.]`
}
