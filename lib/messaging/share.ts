import { getAdminClient } from '@/lib/supabase/admin'

export type SharePublicationStatus = 'created' | 'replayed'

export type SharePrivateReplyResult =
  | { ok: true; eventId: string; status: SharePublicationStatus }
  | {
      ok: false
      code:
        | 'session_access_denied'
        | 'source_not_shareable'
        | 'not_active_in_room'
        | 'room_has_no_audience'
        | 'write_failed'
    }

interface SharePrivateReplyInput {
  sourceEventId: string
  conversationId: string
  userId: string
}

interface RpcError {
  message?: string
  details?: string
  hint?: string
}

const mapPromotionError = (error: RpcError): SharePrivateReplyResult => {
  const detail = [error.message, error.details, error.hint].filter(Boolean).join(' ')
  if (detail.includes('share_session_access_denied')) {
    return { ok: false, code: 'session_access_denied' }
  }
  if (detail.includes('share_source_not_shareable')) {
    return { ok: false, code: 'source_not_shareable' }
  }
  if (detail.includes('share_not_active_in_room')) {
    return { ok: false, code: 'not_active_in_room' }
  }
  if (detail.includes('share_room_has_no_audience')) {
    return { ok: false, code: 'room_has_no_audience' }
  }
  return { ok: false, code: 'write_failed' }
}

// The one promotion boundary from private Voyager output into a room. This
// function is being REPLACED, not wrapped: all authority, idempotency, event
// creation, audience snapshotting, and delivery fan-out now live in one
// service-role-only database transaction. The app receives only its result.
export const sharePrivateVoyagerReply = async ({
  sourceEventId,
  conversationId,
  userId,
}: SharePrivateReplyInput): Promise<SharePrivateReplyResult> => {
  const { data, error } = await getAdminClient().rpc('promote_private_voyager_reply', {
    p_source_event_id: sourceEventId,
    p_conversation_id: conversationId,
    p_user_id: userId,
  })
  if (error) return mapPromotionError(error)

  const row = data?.[0] ?? null
  if (
    !row
    || typeof row.shared_event_id !== 'string'
    || (row.status !== 'created' && row.status !== 'replayed')
  ) {
    return { ok: false, code: 'write_failed' }
  }

  // Atomic publication has already committed at this point. Preserve the
  // existing best-effort semantic embedding seam for both creation and replay:
  // a retry can heal an earlier vector-provider failure, while an OpenAI/vector
  // failure can never roll back or duplicate the publication itself.
  if (typeof row.shared_content === 'string') {
  }

  return {
    ok: true,
    eventId: row.shared_event_id,
    status: row.status,
  }
}
