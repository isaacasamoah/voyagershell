// Room invitations - consent gate on top of the shared spaces model.

import { log } from '@/lib/debug'
import { getAdminClient } from '@/lib/supabase/admin'
import { activateMembers, ensureSpace, type SessionRow } from '@/lib/messaging/room'

type MemberState = 'invited' | 'active' | 'left'

interface SpaceMemberRow {
  space_id: string
  user_id: string
  state: MemberState
}

interface SpaceRow {
  id: string
  voyage_id: string | null
  created_at: string | null
}

const sessions = () => (getAdminClient() as unknown as { from: (t: string) => any }).from('sessions')
const spaces = () => (getAdminClient() as unknown as { from: (t: string) => any }).from('spaces')
const spaceMembers = () => (getAdminClient() as unknown as { from: (t: string) => any }).from('space_members')
const voyages = () => (getAdminClient() as unknown as { from: (t: string) => any }).from('voyages')

const getSession = async (sessionId: string): Promise<SessionRow | null> => {
  const { data, error } = await sessions()
    .select('id, user_id, voyage_id, space_id')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) {
    log.api('invite session lookup failed', { sessionId, error: error.message }, 'error')
    return null
  }
  return (data as SessionRow | null) ?? null
}

/** Re-invite a member who previously left. Guarded on state='left' so a
 *  concurrent accept (state='active') is never clobbered back to 'invited'. */
const reinviteLeftMember = async (spaceId: string, userId: string): Promise<void> => {
  const { error } = await spaceMembers()
    .update({ state: 'invited' })
    .eq('space_id', spaceId)
    .eq('user_id', userId)
    .eq('state', 'left')
  if (error) log.api('re-invite left member failed', { spaceId, userId, error: error.message }, 'error')
}

const getMember = async (spaceId: string, userId: string): Promise<SpaceMemberRow | null> => {
  const { data, error } = await spaceMembers()
    .select('space_id, user_id, state')
    .eq('space_id', spaceId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    log.api('invite member lookup failed', { spaceId, userId, error: error.message }, 'error')
    return null
  }
  return (data as SpaceMemberRow | null) ?? null
}

const upsertMemberState = async (
  spaceId: string,
  userId: string,
  state: Exclude<MemberState, 'left'>,
): Promise<void> => {
  const { error } = await spaceMembers().upsert({ space_id: spaceId, user_id: userId, state }, {
    onConflict: 'space_id,user_id',
  })
  if (error) log.api('invite member upsert failed', { spaceId, userId, state, error: error.message }, 'error')
}

const linkSessionToSpace = async (sessionId: string, spaceId: string): Promise<boolean> => {
  const { error } = await sessions().update({ space_id: spaceId }).eq('id', sessionId)
  if (error) {
    log.api('invite session link failed', { sessionId, spaceId, error: error.message }, 'error')
    return false
  }
  return true
}

const isHouseholdVoyage = async (voyageId: string): Promise<boolean> => {
  const householdSlug = process.env.HOUSEHOLD_SHARE_VOYAGE
  if (!householdSlug) return false

  const { data, error } = await voyages()
    .select('slug')
    .eq('id', voyageId)
    .maybeSingle()
  if (error) {
    log.api('household voyage lookup failed', { voyageId, error: error.message }, 'error')
    return false
  }
  return ((data as { slug: string } | null)?.slug ?? null) === householdSlug
}

export const inviteToRoom = async (
  sessionId: string,
  inviteeUserId: string,
): Promise<{ state: 'invited' | 'active'; spaceId: string | null }> => {
  const session = await getSession(sessionId)
  if (!session) return { state: 'invited', spaceId: null }

  const spaceId = await ensureSpace(session, true)
  if (!spaceId) return { state: 'invited', spaceId: null }

  await activateMembers(spaceId, [session.user_id])

  const autoAccept = session.voyage_id ? await isHouseholdVoyage(session.voyage_id) : false
  if (autoAccept) {
    await activateMembers(spaceId, [inviteeUserId])
    return { state: 'active', spaceId }
  }

  // Never downgrade an already-active/invited row; only (re)invite a fresh or
  // previously-left member. The re-invite is guarded so it can't clobber a
  // concurrent accept (see reinviteLeftMember).
  const existing = await getMember(spaceId, inviteeUserId)
  if (existing?.state === 'active') return { state: 'active', spaceId }
  if (existing?.state === 'invited') return { state: 'invited', spaceId }
  if (existing?.state === 'left') await reinviteLeftMember(spaceId, inviteeUserId)
  else await upsertMemberState(spaceId, inviteeUserId, 'invited')
  return { state: 'invited', spaceId }
}

const findNewestMembershipSpace = async (
  sessionId: string,
  userId: string,
  state: Extract<MemberState, 'invited' | 'active'>,
): Promise<{ session: SessionRow; spaceId: string } | null> => {
  const session = await getSession(sessionId)
  if (!session || session.user_id !== userId || !session.voyage_id) return null

  const { data: memberships, error: memberError } = await spaceMembers()
    .select('space_id, user_id, state')
    .eq('user_id', userId)
    .eq('state', state)
  if (memberError) {
    log.api('room membership lookup failed', { userId, state, error: memberError.message }, 'error')
    return null
  }

  const spaceIds = ((memberships as SpaceMemberRow[] | null) ?? [])
    .map((row) => row.space_id)
    .filter((spaceId) => spaceId !== session.space_id)
  if (spaceIds.length === 0) return null

  const { data: matchingSpace, error: spaceError } = await spaces()
    .select('id, voyage_id, created_at')
    .in('id', spaceIds)
    .eq('voyage_id', session.voyage_id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false }) // deterministic tiebreak on identical timestamps
    .limit(1)
    .maybeSingle()
  if (spaceError) {
    log.api('room membership space lookup failed', {
      userId,
      voyageId: session.voyage_id,
      state,
      error: spaceError.message,
    }, 'error')
    return null
  }

  const found = matchingSpace as SpaceRow | null
  return found ? { session, spaceId: found.id } : null
}

export type RoomInviteResponse =
  | { responded: true; accepted: true; spaceId: string }
  | { responded: true; accepted: false }
  | { responded: false; reason: 'no_pending_invite' }

export const respondToRoomInvite = async (
  sessionId: string,
  userId: string,
  accept: boolean,
): Promise<RoomInviteResponse> => {
  const pending = await findNewestMembershipSpace(sessionId, userId, 'invited')
  if (!pending) return { responded: false, reason: 'no_pending_invite' }

  const state: Extract<MemberState, 'active' | 'left'> = accept ? 'active' : 'left'
  const { error } = await spaceMembers()
    .update({ state })
    .eq('space_id', pending.spaceId)
    .eq('user_id', userId)
    .eq('state', 'invited')
  if (error) {
    log.api('room invite response failed', { sessionId, userId, spaceId: pending.spaceId, state, error: error.message }, 'error')
  }

  if (!accept) return { responded: true, accepted: false }

  await linkSessionToSpace(sessionId, pending.spaceId)
  return { responded: true, accepted: true, spaceId: pending.spaceId }
}

export const enterActiveRoom = async (
  sessionId: string,
  userId: string,
): Promise<{ entered: boolean; spaceId?: string }> => {
  const active = await findNewestMembershipSpace(sessionId, userId, 'active')
  if (!active || active.session.space_id) return { entered: false }

  const linked = await linkSessionToSpace(sessionId, active.spaceId)
  return linked ? { entered: true, spaceId: active.spaceId } : { entered: false }
}
