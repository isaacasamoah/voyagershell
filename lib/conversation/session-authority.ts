import { getAdminClient } from '@/lib/supabase/admin'
import type {
  ResumableSessionRow,
  SessionAuthorityRow,
  SessionScopeRow,
} from '@/lib/supabase/schema/functions'

export class SessionAccessError extends Error {
  constructor() {
    super('session_access_denied')
    this.name = 'SessionAccessError'
  }
}

const throwRpcError = (error: { code?: string; message: string }): never => {
  if (error.code === '42501' || error.message.includes('session_access_denied')) {
    throw new SessionAccessError()
  }
  throw new Error(error.message)
}

const firstRow = <T>(rows: T[] | null): T => {
  const row = rows?.[0]
  if (!row) throw new SessionAccessError()
  return row
}

export const sessionAuthority = {
  getOrCreateActive: async (
    userId: string,
    voyageSlug: string | null,
  ): Promise<SessionAuthorityRow> => {
    const { data, error } = await getAdminClient().rpc('get_or_create_active_session', {
      p_user_id: userId,
      p_voyage_slug: voyageSlug,
    })
    if (error) throwRpcError(error)
    return firstRow(data)
  },

  listResumable: async (
    userId: string,
    voyageSlug: string | null,
    limit: number,
  ): Promise<ResumableSessionRow[]> => {
    const { data, error } = await getAdminClient().rpc('get_resumable_sessions', {
      p_user_id: userId,
      p_voyage_slug: voyageSlug,
      p_limit: limit,
    })
    if (error) throwRpcError(error)
    return data ?? []
  },

  getScope: async (sessionId: string, userId: string): Promise<SessionScopeRow> => {
    const { data, error } = await getAdminClient().rpc('get_session_scope', {
      p_session_id: sessionId,
      p_user_id: userId,
    })
    if (error) throwRpcError(error)
    return firstRow(data)
  },

  resume: async (sessionId: string, userId: string): Promise<SessionAuthorityRow> => {
    const { data, error } = await getAdminClient().rpc('resume_session', {
      p_session_id: sessionId,
      p_user_id: userId,
    })
    if (error) throwRpcError(error)
    return firstRow(data)
  },

  archive: async (sessionId: string, userId: string): Promise<boolean> => {
    const { data, error } = await getAdminClient().rpc('archive_session', {
      p_session_id: sessionId,
      p_user_id: userId,
    })
    if (error) throwRpcError(error)
    return data === true
  },

  touchActivity: async (sessionId: string, userId: string): Promise<boolean> => {
    const { data, error } = await getAdminClient().rpc('touch_session_activity', {
      p_session_id: sessionId,
      p_user_id: userId,
    })
    if (error) throwRpcError(error)
    return data === true
  },

  getLastActiveVoyageSlug: async (userId: string): Promise<string | null> => {
    const { data, error } = await getAdminClient().rpc('get_last_active_voyage_slug', {
      p_user_id: userId,
    })
    if (error) throwRpcError(error)
    return data
  },

  setAiPresence: async (
    sessionId: string,
    userId: string,
    present: boolean,
  ): Promise<boolean> => {
    const { data, error } = await getAdminClient().rpc('set_session_ai_presence', {
      p_session_id: sessionId,
      p_user_id: userId,
      p_present: present,
    })
    if (error) throwRpcError(error)
    return data === true
  },

  removeRoomMember: async (
    sessionId: string,
    userId: string,
    memberUserId: string,
  ): Promise<boolean> => {
    const { data, error } = await getAdminClient().rpc('remove_session_room_member', {
      p_session_id: sessionId,
      p_user_id: userId,
      p_member_user_id: memberUserId,
    })
    if (error) throwRpcError(error)
    return data === true
  },
}
