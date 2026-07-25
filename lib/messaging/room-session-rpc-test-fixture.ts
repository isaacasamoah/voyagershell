import type {
  SessionRow,
  SpaceMemberRow,
  SpaceRow,
  VoyageRow,
} from './room-test-types'

interface SessionRpcDb {
  sessions: Map<string, SessionRow>
  spaces: Map<string, SpaceRow>
  space_members: Map<string, SpaceMemberRow>
  voyages: Map<string, VoyageRow>
}

type SessionRpcResult = {
  data: unknown
  error: { code?: string; message: string } | null
}

const denied = (): SessionRpcResult => ({
  data: null,
  error: { code: '42501', message: 'session_access_denied' },
})

export const handleSessionRpc = (
  name: string,
  args: Record<string, unknown>,
  db: SessionRpcDb,
  allocateSpaceId: () => string,
): SessionRpcResult | undefined => {
  if (![
    'get_session_scope',
    'set_session_ai_presence',
    'remove_session_room_member',
  ].includes(name)) return undefined

  const sessionId = String(args.p_session_id ?? '')
  const userId = String(args.p_user_id ?? '')
  const session = db.sessions.get(sessionId)
  if (!session || session.user_id !== userId) return denied()

  if (name === 'get_session_scope') {
    return {
      data: [{
        ...session,
        voyage_slug: db.voyages.get(session.voyage_id ?? '')?.slug ?? null,
        status: 'active',
      }],
      error: null,
    }
  }

  const hasRoomCapability = !session.space_id
    || db.space_members.get(`${session.space_id}:${userId}`)?.state === 'active'
  if (!hasRoomCapability) return denied()

  if (name === 'set_session_ai_presence') {
    let spaceId = session.space_id
    if (!spaceId) {
      spaceId = allocateSpaceId()
      db.spaces.set(spaceId, {
        id: spaceId,
        kind: 'room',
        voyage_id: session.voyage_id,
        ai_present: Boolean(args.p_present),
        created_by: userId,
      })
      db.space_members.set(`${spaceId}:${userId}`, {
        space_id: spaceId,
        user_id: userId,
        state: 'active',
      })
      session.space_id = spaceId
    } else {
      const space = db.spaces.get(spaceId)
      if (space) space.ai_present = Boolean(args.p_present)
    }
    return { data: true, error: null }
  }

  if (!session.space_id) return denied()
  const member = db.space_members.get(
    `${session.space_id}:${String(args.p_member_user_id ?? '')}`,
  )
  const removed = member?.state === 'active'
  if (member && removed) member.state = 'left'
  return { data: removed, error: null }
}
