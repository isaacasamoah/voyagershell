// The Room — a session's participant set (communication primitives, Ch.1).
// room_people = humans in the room (delivery fans out to them); ai_present =
// is Voyager in the room (responds). Session-scoped state, admin-written.

import { getAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/debug'

const sessions = () => (getAdminClient() as unknown as { from: (t: string) => any }).from('sessions')

export interface RoomState {
  roomPeople: string[] // user_ids
  aiPresent: boolean
}

export const getRoom = async (sessionId: string): Promise<RoomState> => {
  const { data, error } = await sessions()
    .select('room_people, ai_present')
    .eq('id', sessionId)
    .maybeSingle()
  if (error || !data) return { roomPeople: [], aiPresent: true }
  const row = data as { room_people: string[] | null; ai_present: boolean | null }
  return { roomPeople: row.room_people ?? [], aiPresent: row.ai_present ?? true }
}

/** Add a person to the room. Entering a human thread quiets Voyager by default
 *  (ai_present → false); `+voyager` brings it back. */
export const addRoomPerson = async (sessionId: string, userId: string): Promise<RoomState> => {
  const room = await getRoom(sessionId)
  if (room.roomPeople.includes(userId)) return room
  const next = { roomPeople: [...room.roomPeople, userId], aiPresent: false }
  const { error } = await sessions()
    .update({ room_people: next.roomPeople, ai_present: next.aiPresent })
    .eq('id', sessionId)
  if (error) log.api('addRoomPerson failed', { error: error.message }, 'error')
  return next
}

export const removeRoomPerson = async (sessionId: string, userId: string): Promise<RoomState> => {
  const room = await getRoom(sessionId)
  const roomPeople = room.roomPeople.filter((p) => p !== userId)
  const { error } = await sessions().update({ room_people: roomPeople }).eq('id', sessionId)
  if (error) log.api('removeRoomPerson failed', { error: error.message }, 'error')
  return { ...room, roomPeople }
}

export const setAiPresent = async (sessionId: string, present: boolean): Promise<void> => {
  const { error } = await sessions().update({ ai_present: present }).eq('id', sessionId)
  if (error) log.api('setAiPresent failed', { error: error.message }, 'error')
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
