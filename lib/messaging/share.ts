import { createMessageEvent } from '@/lib/knowledge'
import { fanOutDeliveries } from '@/lib/messaging/deliveries'
import { getActiveMemberIds } from '@/lib/messaging/room'
import { getAdminClient } from '@/lib/supabase/admin'

interface PrivateVoyagerEventRow {
  id: string
  event_type: string
  actor_type: string
  user_id: string | null
  participants: string[] | null
  content: string | null
  source_ref: unknown
}

export type SharePrivateReplyResult =
  | { ok: true; eventId: string }
  | { ok: false; code: 'source_not_shareable' | 'room_has_no_audience' | 'write_failed' }

const sourceConversationId = (sourceRef: unknown): string | null => {
  if (!sourceRef || typeof sourceRef !== 'object' || Array.isArray(sourceRef)) return null
  const id = (sourceRef as Record<string, unknown>).conversation_id
  return typeof id === 'string' ? id : null
}

const sourceRole = (sourceRef: unknown): string | null => {
  if (!sourceRef || typeof sourceRef !== 'object' || Array.isArray(sourceRef)) return null
  const role = (sourceRef as Record<string, unknown>).role
  return typeof role === 'string' ? role : null
}

const isOwnerPrivateVoyagerReply = (
  row: PrivateVoyagerEventRow,
  userId: string,
  conversationId: string,
): boolean => (
  row.event_type === 'conversation'
  && row.actor_type === 'voyager'
  && row.user_id === userId
  && row.participants?.length === 1
  && row.participants[0] === userId
  && sourceConversationId(row.source_ref) === conversationId
  && sourceRole(row.source_ref) === 'assistant'
  && Boolean(row.content?.trim())
)

interface SharePrivateReplyInput {
  sourceEventId: string
  conversationId: string
  userId: string
  voyageSlug: string | null
}

// The one promotion boundary from private Voyager output into a room. The
// source event is loaded canonically and must be an owner-only assistant turn
// in this exact session. The destination roster is resolved fresh server-side.
// The resulting ledger row is human-authored and content-only: it contains no
// private source id, prompt, retrieval trace, or dereferenceable provenance.
export const sharePrivateVoyagerReply = async ({
  sourceEventId,
  conversationId,
  userId,
  voyageSlug,
}: SharePrivateReplyInput): Promise<SharePrivateReplyResult> => {
  const admin = getAdminClient()
  const { data } = await admin
    .from('knowledge_events')
    .select('id,event_type,actor_type,user_id,participants,content,source_ref')
    .eq('id', sourceEventId)
    .maybeSingle()
  const source = data as PrivateVoyagerEventRow | null
  if (!source || !isOwnerPrivateVoyagerReply(source, userId, conversationId)) {
    return { ok: false, code: 'source_not_shareable' }
  }

  const participants = await getActiveMemberIds(conversationId, userId)
  const recipients = participants.filter((id) => id !== userId)
  if (recipients.length === 0) return { ok: false, code: 'room_has_no_audience' }

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name,username')
    .eq('id', userId)
    .maybeSingle()
  const person = profile as { display_name: string | null; username: string | null } | null
  const senderName = person?.display_name ?? person?.username ?? 'Someone'

  const eventId = await createMessageEvent(conversationId, 'user', source.content as string, {
    userId,
    voyageSlug: voyageSlug ?? undefined,
    participants,
    addressedTo: recipients,
    source: 'shared-voyager',
    senderDisplayName: senderName,
    senderUserId: userId,
    attentionScore: 0.85,
    contextSnippet: `${senderName} shared to room: ${(source.content as string).slice(0, 60)}`,
    eventType: 'message',
  })
  if (!eventId) return { ok: false, code: 'write_failed' }

  await fanOutDeliveries(eventId, recipients)
  return { ok: true, eventId }
}
