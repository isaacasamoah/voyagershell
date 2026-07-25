import { log } from '@/lib/debug'
import { createMessageEvent } from '@/lib/knowledge/events'
import { fanOutDeliveries } from '@/lib/messaging/deliveries'
import { getAdminClient } from '@/lib/supabase/admin'
import { resolveSessionVoyage } from '@/lib/voyage/session'

/** Notify the room after an explicit accepted join through the normal event lane. */
export const announceJoin = async (
  conversationId: string,
  spaceId: string,
  joinerUserId: string,
): Promise<void> => {
  try {
    const admin = getAdminClient()
    const { data: memberRows } = await admin
      .rpc('get_effective_space_member_ids', { p_space_id: spaceId })
    const memberIds = (memberRows ?? []).map((row) => row.user_id)
      .filter((id): id is string => Boolean(id))
    if (!memberIds.includes(joinerUserId)) return
    const recipients = memberIds.filter((id) => id !== joinerUserId)
    if (recipients.length === 0) return

    const { data: profile } = await admin.from('profiles')
      .select('display_name').eq('id', joinerUserId).maybeSingle()
    const joinerName = profile?.display_name ?? 'Someone'
    const voyageSlug = await resolveSessionVoyage(conversationId, joinerUserId)
    const eventId = await createMessageEvent(conversationId, 'user', `${joinerName} joined the room`, {
      userId: joinerUserId,
      voyageSlug: voyageSlug ?? undefined,
      participants: recipients,
      addressedTo: recipients,
      source: 'join',
      senderUserId: joinerUserId,
      senderDisplayName: joinerName,
      attentionScore: 0.3,
    })
    if (eventId) void fanOutDeliveries(eventId, recipients)
  } catch (error) {
    log.api('announceJoin failed', { conversationId, spaceId, joinerUserId, error: String(error) }, 'error')
  }
}
