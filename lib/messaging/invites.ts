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

/**
 * Deliver the knock — the visible invite message, ONE source for every invite
 * path (`+name` grammar AND the add_to_room tool). An invited row without a
 * delivered knock is invisible to the invitee (live gap, 2026-07-10).
 */
export const deliverRoomInvite = async (
  conversationId: string,
  inviter: { userId: string; displayName: string },
  inviteeUserId: string,
  voyageSlug?: string,
): Promise<void> => {
  const { createMessageEvent } = await import('@/lib/knowledge/events')
  const { fanOutDeliveries } = await import('@/lib/messaging/deliveries')
  const eventId = await createMessageEvent(conversationId, 'user',
    `${inviter.displayName} invited you to a room — reply to join.`, {
      userId: inviter.userId,
      voyageSlug,
      participants: [inviteeUserId],
      addressedTo: [inviteeUserId],
      source: 'invite',
      senderDisplayName: inviter.displayName,
      senderUserId: inviter.userId,
      attentionScore: 0.9,
      contextSnippet: `${inviter.displayName} invited you to a room`,
    })
  if (eventId) void fanOutDeliveries(eventId, [inviteeUserId])
}

// Every invite knocks — household voyages included. HOUSEHOLD_SHARE_VOYAGE is
// a BRAIN-SHARE (subscription) concept only (lib/models/connections.ts); it no
// longer grants social auto-accept. If a trust tier returns, it comes back as
// attested voyage config, not an env-var side effect. (Isaac, 2026-07-10)
export const inviteToRoom = async (
  sessionId: string,
  inviteeUserId: string,
): Promise<{ state: 'invited' | 'active'; spaceId: string | null }> => {
  const session = await getSession(sessionId)
  if (!session) return { state: 'invited', spaceId: null }

  const spaceId = await ensureSpace(session, true)
  if (!spaceId) return { state: 'invited', spaceId: null }

  await activateMembers(spaceId, [session.user_id])

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
  // Accepting an invite must consider the session's OWN space (the invitee may
  // already be linked to it while still 'invited') — so acceptance never
  // strands. Re-entry (enterActiveRoom) excludes it: you can't re-enter the
  // space you're already in.
  excludeCurrentSpace = true,
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
    .filter((spaceId) => !excludeCurrentSpace || spaceId !== session.space_id)
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
  const pending = await findNewestMembershipSpace(sessionId, userId, 'invited', false)
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
