import { resolveSessionVoyage } from '@/lib/voyage/session'
import {
  getFeedTableClient,
  loadPrivateFeedEnrichment,
  resolveViewerInviteStates,
} from './feed-enrichment'
import { queryScopedEvents } from './feed-queries'
import {
  getConversationRole,
  getFeedKind,
  getInviteSpaceId,
  toFeedEvents,
  type DeliveryRow,
} from './feed-rows'
import type { FeedEvent } from './feed-types'

export const getFeed = async (
  userId: string,
  conversationId: string,
): Promise<FeedEvent[]> => {
  const voyageSlug = await resolveSessionVoyage(conversationId, userId)
  const supabase = getFeedTableClient()
  const rows = await queryScopedEvents(userId, conversationId, voyageSlug)
  const privateAssistantIds = rows
    .filter((row) => (
      row.event_type === 'conversation'
      && getConversationRole(row) === 'assistant'
      && row.user_id === userId
    ))
    .map((row) => row.id)
  const messageIds = rows
    .filter((row) => row.event_type === 'message')
    .map((row) => row.id)
  const inviteSpaceIds = Array.from(new Set(rows
    .filter((row) => getFeedKind(row) === 'invite')
    .map(getInviteSpaceId)
    .filter((spaceId): spaceId is string => Boolean(spaceId))))
  const viewerInviteStates = await resolveViewerInviteStates(
    supabase,
    inviteSpaceIds,
    userId,
  )
  const [enrichment, deliveryResult] = await Promise.all([
    loadPrivateFeedEnrichment(
      supabase,
      userId,
      conversationId,
      privateAssistantIds,
    ),
    messageIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
        .from('message_deliveries')
        .select('id,event_id,seen_at')
        .eq('recipient_user_id', userId)
        .in('event_id', messageIds),
  ])
  if (deliveryResult.error) throw new Error(deliveryResult.error.message)
  return toFeedEvents(
    rows,
    (deliveryResult.data ?? []) as DeliveryRow[],
    userId,
    viewerInviteStates,
    enrichment,
  )
}
