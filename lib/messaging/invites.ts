// Room invitations - consent gate on top of the shared spaces model.

import { getAdminClient } from '@/lib/supabase/admin'

/**
 * Deliver the knock — the visible invite message, ONE source for every invite
 * path (`+name` grammar AND the add_to_room tool). An invited row without a
 * delivered knock is invisible to the invitee (live gap, 2026-07-10).
 */
export const deliverRoomInvite = async (
  conversationId: string,
  inviter: { userId: string; displayName: string },
  inviteeUserId: string,
  spaceId: string,
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
      spaceId,
      attentionScore: 0.9,
      contextSnippet: `${inviter.displayName} invited you to a room`,
    })
  if (eventId) void fanOutDeliveries(eventId, [inviteeUserId])
}

// Every invite knocks — household voyages included. HOUSEHOLD_SHARE_VOYAGE is
// a BRAIN-SHARE (subscription) concept only (lib/models/connections.ts); it no
// longer grants social auto-accept. If a trust tier returns, it comes back as
// attested voyage config, not an env-var side effect. (Isaac, 2026-07-10)
export type RoomInviteCreation =
  | { state: 'invited' | 'active'; spaceId: string }
  | { state: 'denied'; spaceId: string | null }

export const inviteToRoom = async (
  sessionId: string,
  inviterUserId: string,
  inviteeUserId: string,
): Promise<RoomInviteCreation> => {
  const { data, error } = await getAdminClient().rpc('create_room_invite', {
    p_session_id: sessionId,
    p_inviter_user_id: inviterUserId,
    p_invitee_user_id: inviteeUserId,
  })
  if (error) throw new Error(`room_invite_create_failed:${error.message}`)
  const result = data[0]
  if (!result) throw new Error('room_invite_create_empty_result')
  if (result.invite_status === 'denied') {
    return { state: 'denied', spaceId: result.invite_space_id }
  }
  if ((result.invite_status === 'active' || result.invite_status === 'invited')
      && result.invite_space_id) {
    return { state: result.invite_status, spaceId: result.invite_space_id }
  }
  throw new Error('room_invite_create_invalid_result')
}

export type RoomInviteResponse =
  | { responded: true; accepted: true; spaceId: string; transition: 'accepted' | 'entered' }
  | { responded: true; accepted: false }
  | { responded: false; reason: 'no_pending_invite' | 'denied' }

const transitionRoomInvite = async (
  sessionId: string,
  userId: string,
  action: 'accept' | 'decline',
  spaceId: string | null,
) => {
  const { data, error } = await getAdminClient().rpc('transition_room_invite', {
    p_session_id: sessionId,
    p_user_id: userId,
    p_action: action,
    p_space_id: spaceId,
  })
  if (error) throw new Error(`room_invite_transition_failed:${error.message}`)
  const result = data[0]
  if (!result) throw new Error('room_invite_transition_empty_result')
  return result
}

export const respondToRoomInvite = async (
  sessionId: string,
  userId: string,
  accept: boolean,
  spaceId: string,
): Promise<RoomInviteResponse> => {
  const result = await transitionRoomInvite(sessionId, userId, accept ? 'accept' : 'decline', spaceId)
  if (result.transition_status === 'declined') return { responded: true, accepted: false }
  if ((result.transition_status === 'accepted' || result.transition_status === 'entered')
      && result.transition_space_id) {
    return { responded: true, accepted: true, spaceId: result.transition_space_id,
      transition: result.transition_status }
  }
  return { responded: false, reason: result.transition_status === 'denied' ? 'denied' : 'no_pending_invite' }
}
