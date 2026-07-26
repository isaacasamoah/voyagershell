// The Room — a session's shared space participant set.
// sessions.space_id points at one spaces row; active space_members fan out.

import { getAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/debug'
import {
  sessionAuthority,
  SessionAccessError,
} from '@/lib/conversation/session-authority'

const spaces = () => getAdminClient().from('spaces')
const profiles = () => getAdminClient().from('profiles')

export interface RoomState {
  roomPeople: string[] // user_ids, excluding the session owner
  aiPresent: boolean
  // The room this session sits in, or null when the session has no room. The
  // ingress claim needs it to scope the source audience; it is a location, never
  // an authorization — roomPeople is what proves capability.
  spaceId: string | null
}

export interface DisplayRoomState {
  people: string[]
  aiPresent: boolean
}

export interface RemoveRoomPersonResult {
  removed: boolean
  room: RoomState
}

const getSession = async (sessionId: string, userId: string) => {
  try {
    return await sessionAuthority.getScope(sessionId, userId)
  } catch (error) {
    if (!(error instanceof SessionAccessError)) {
      log.api('room session lookup failed', { sessionId, error: String(error) }, 'error')
    }
    return null
  }
}

const activeMemberRows = (spaceId: string) =>
  getAdminClient().rpc('get_effective_space_member_ids', { p_space_id: spaceId })

// Every ACTIVE member of the session's room, INCLUDING the session owner —
// recomputed fresh for explicit human sends and Share-to-room. Returns the
// caller when the session has no space yet.
export const getActiveMemberIds = async (
  sessionId: string,
  callerFallback: string,
): Promise<string[]> => {
  const session = await getSession(sessionId, callerFallback)
  if (!session?.space_id) return [callerFallback]

  const { data: members, error } = await activeMemberRows(session.space_id)
  if (error) {
    log.api('getActiveMemberIds failed', { sessionId, error: error.message }, 'error')
    return [callerFallback]
  }
  const ids = (members ?? [])
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

export const getRoom = async (sessionId: string, userId: string): Promise<RoomState> => {
  const session = await getSession(sessionId, userId)
  if (!session?.space_id) return { roomPeople: [], aiPresent: true, spaceId: null }

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
    return { roomPeople: [], aiPresent: true, spaceId: null }
  }

  const activeIds = (members ?? [])
    .map((member) => member.user_id)
    .filter((id): id is string => Boolean(id))
  // Fail closed when the session owner has left. The stale session pointer is
  // retained as location/history only and must not preserve room capability.
  if (!session.user_id || !activeIds.includes(session.user_id)) {
    return { roomPeople: [], aiPresent: true, spaceId: null }
  }

  const roomPeople = activeIds.filter((id) => id !== session.user_id)
  const aiPresent = space?.ai_present ?? true
  return { roomPeople, aiPresent, spaceId: session.space_id }
}

export const getDisplayRoom = async (
  sessionId: string,
  userId: string,
): Promise<DisplayRoomState> => {
  const room = await getRoom(sessionId, userId)
  if (room.roomPeople.length === 0) return { people: [], aiPresent: room.aiPresent }

  const { data, error } = await profiles()
    .select('id, display_name')
    .in('id', room.roomPeople)
  if (error) {
    log.api('room profile lookup failed', { sessionId, error: error.message }, 'error')
    return { people: room.roomPeople.map(() => 'someone'), aiPresent: room.aiPresent }
  }
  const byId = new Map((data ?? [])
    .map((profile) => [profile.id, profile.display_name]))
  return {
    people: room.roomPeople.map((id) => byId.get(id) ?? 'someone'),
    aiPresent: room.aiPresent,
  }
}

export const removeRoomPerson = async (
  sessionId: string,
  callerUserId: string,
  memberUserId: string,
): Promise<RemoveRoomPersonResult> => {
  let removed = false
  try {
    removed = await sessionAuthority.removeRoomMember(
      sessionId,
      callerUserId,
      memberUserId,
    )
  } catch (error) {
    if (!(error instanceof SessionAccessError)) {
      log.api('removeRoomPerson failed', { sessionId, error: String(error) }, 'error')
    }
  }
  return {
    removed,
    room: await getRoom(sessionId, callerUserId),
  }
}

export const setAiPresent = async (
  sessionId: string,
  userId: string,
  present: boolean,
): Promise<boolean> => {
  try {
    return await sessionAuthority.setAiPresence(sessionId, userId, present)
  } catch (error) {
    if (!(error instanceof SessionAccessError)) {
      log.api('setAiPresent failed', { sessionId, error: String(error) }, 'error')
    }
    return false
  }
}
