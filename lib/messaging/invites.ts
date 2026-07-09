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

const setSpaceAiPresent = async (spaceId: string, aiPresent: boolean): Promise<void> => {
  const { error } = await spaces().update({ ai_present: aiPresent }).eq('id', spaceId)
  if (error) log.api('invite room presence update failed', { spaceId, error: error.message }, 'error')
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

const findVoyageSession = async (
  userId: string,
  voyageId: string,
): Promise<{ id: string } | null> => {
  const { data, error } = await sessions()
    .select('id')
    .eq('user_id', userId)
    .eq('voyage_id', voyageId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    log.api('invite voyage session lookup failed', { userId, voyageId, error: error.message }, 'error')
    return null
  }
  return (data as { id: string } | null) ?? null
}

export const inviteToRoom = async (
  sessionId: string,
  inviteeUserId: string,
): Promise<{ state: 'invited' | 'active'; spaceId: string | null }> => {
  const session = await getSession(sessionId)
  if (!session) return { state: 'invited', spaceId: null }

  const spaceId = await ensureSpace(session, false)
  if (!spaceId) return { state: 'invited', spaceId: null }

  await activateMembers(spaceId, [session.user_id])
  await setSpaceAiPresent(spaceId, false)

  const autoAccept = session.voyage_id ? await isHouseholdVoyage(session.voyage_id) : false
  if (autoAccept) {
    await activateMembers(spaceId, [inviteeUserId])
    const inviteeSession = session.voyage_id
      ? await findVoyageSession(inviteeUserId, session.voyage_id)
      : null
    if (inviteeSession) await linkSessionToSpace(inviteeSession.id, spaceId)
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

export const linkPendingSpace = async (
  sessionId: string,
  userId: string,
  voyageId: string,
): Promise<{ linked: boolean; spaceId?: string; wasInvited?: boolean }> => {
  const session = await getSession(sessionId)
  if (!session || session.user_id !== userId || session.voyage_id !== voyageId) return { linked: false }

  const { data: memberships, error: memberError } = await spaceMembers()
    .select('space_id, user_id, state')
    .eq('user_id', userId)
    .in('state', ['invited', 'active'])
  if (memberError) {
    log.api('pending invite lookup failed', { userId, voyageId, error: memberError.message }, 'error')
    return { linked: false }
  }

  const rows = ((memberships as SpaceMemberRow[] | null) ?? [])
    .filter((row) => row.space_id !== session.space_id)
  if (rows.length === 0) return { linked: false }

  const memberBySpace = new Map(rows.map((row) => [row.space_id, row]))
  const { data: matchingSpaces, error: spaceError } = await spaces()
    .select('id, voyage_id, created_at')
    .in('id', Array.from(memberBySpace.keys()))
    .eq('voyage_id', voyageId)
    .order('created_at', { ascending: false })
  if (spaceError) {
    log.api('pending invite space lookup failed', { userId, voyageId, error: spaceError.message }, 'error')
    return { linked: false }
  }

  const orderedSpaces = (matchingSpaces as SpaceRow[] | null) ?? []
  // A pending INVITE always wins — accept it even if this session is already on
  // another space (the reciprocal accept moves the user into the shared room).
  const invitedSpace = orderedSpaces.find((space) => memberBySpace.get(space.id)?.state === 'invited')
  // Otherwise only (re)link an already-ACTIVE membership when this session isn't
  // on a space yet — e.g. a household auto-accept that activated the user before
  // they had a session. Never hijack an already-linked session on an ordinary
  // message.
  const activeSpace = session.space_id
    ? undefined
    : orderedSpaces.find((space) => memberBySpace.get(space.id)?.state === 'active')
  const chosenSpace = invitedSpace ?? activeSpace
  if (!chosenSpace) return { linked: false }

  const chosenMember = memberBySpace.get(chosenSpace.id)
  await upsertMemberState(chosenSpace.id, userId, 'active')
  const linked = await linkSessionToSpace(sessionId, chosenSpace.id)
  if (!linked) return { linked: false }

  return { linked: true, spaceId: chosenSpace.id, wasInvited: chosenMember?.state === 'invited' }
}
