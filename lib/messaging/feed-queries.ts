import { resolveSessionVoyage } from '@/lib/voyage/session'
import { getFeedTableClient } from './feed-enrichment'
import {
  getFeedEventSessionId,
  isInFeedContext,
  type FeedEventRow,
} from './feed-rows'

const inSessionOrMessage = (conversationId: string): string => [
  'event_type.eq.message',
  `metadata->>session_id.eq.${conversationId}`,
  `and(metadata->>session_id.is.null,source_ref->>conversation_id.eq.${conversationId})`,
].join(',')

export const queryScopedEvents = async (
  userId: string,
  conversationId: string,
  voyageSlug?: string | null,
  limit = 200,
): Promise<FeedEventRow[]> => {
  const scopedVoyageSlug = voyageSlug === undefined
    ? await resolveSessionVoyage(conversationId, userId)
    : voyageSlug
  const supabase = getFeedTableClient()
  let query = supabase
    .from('knowledge_events')
    .select('id,event_type,content,created_at,metadata,source_ref,actor_type,user_id,participants,voyage_slug')
    .in('event_type', ['conversation', 'message'])
    .contains('participants', [userId])
    .or(inSessionOrMessage(conversationId))
    .order('created_at', { ascending: false })
    .limit(limit)
  query = scopedVoyageSlug
    ? query.eq('voyage_slug', scopedVoyageSlug)
    : query.is('voyage_slug', null)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as FeedEventRow[]).filter((row) => (
    isInFeedContext(row, userId, conversationId, scopedVoyageSlug)
  ))
}

export const queryScopedEventsForConversations = async (
  userId: string,
  conversationIds: string[],
  voyageSlug: string | null,
  limit = 10_000,
): Promise<FeedEventRow[]> => {
  if (conversationIds.length === 0) return []
  const supabase = getFeedTableClient()
  const conversationIdSet = new Set(conversationIds)
  let query = supabase
    .from('knowledge_events')
    .select('id,event_type,content,created_at,metadata,source_ref,actor_type,user_id,participants,voyage_slug')
    .in('event_type', ['conversation', 'message'])
    .contains('participants', [userId])
    .in('source_ref->>conversation_id', conversationIds)
    .order('created_at', { ascending: false })
    .limit(limit)
  query = voyageSlug
    ? query.eq('voyage_slug', voyageSlug)
    : query.is('voyage_slug', null)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as FeedEventRow[]).filter((row) => {
    const eventConversationId = getFeedEventSessionId(row)
    return Boolean(eventConversationId && conversationIdSet.has(eventConversationId))
      && row.participants?.includes(userId) === true
      && (row.event_type === 'conversation' || row.event_type === 'message')
  })
}
