import { getAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/types'
import { SessionAccessError, resolveSessionVoyage } from '@/lib/voyage'
import { sortFeedEvents, type FeedEvent, type FeedEventRole, type FeedEventType } from './feed-types'

export interface FeedEventRow {
  id: string
  event_type: string
  content: string | null
  created_at: string
  metadata: Json | null
  source_ref: Json | null
  actor_type: string
  user_id: string | null
  participants: string[] | null
  voyage_slug: string | null
}

interface DeliveryRow {
  id: string
  event_id: string
  seen_at: string | null
}

type JsonRecord = { [key: string]: Json | undefined }

const typedTable = () => (
  getAdminClient() as unknown as { from: (table: string) => any }
)

const isObject = (value: Json | null): value is JsonRecord => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

const getString = (value: JsonRecord, key: string): string | null => {
  const item = value[key]
  return typeof item === 'string' ? item : null
}

const getSessionId = (row: FeedEventRow): string | null => {
  const metadataSessionId = isObject(row.metadata) ? getString(row.metadata, 'session_id') : null
  if (metadataSessionId) return metadataSessionId
  return isObject(row.source_ref) ? getString(row.source_ref, 'conversation_id') : null
}

const getSenderUserId = (row: FeedEventRow): string | null => (
  isObject(row.metadata) ? getString(row.metadata, 'sender_user_id') : null
)

const getSenderDisplayName = (row: FeedEventRow): string | null => (
  isObject(row.metadata) ? getString(row.metadata, 'sender_display_name') : null
)

const getConversationRole = (row: FeedEventRow): FeedEventRole => {
  const role = isObject(row.source_ref) ? getString(row.source_ref, 'role') : null
  return role === 'assistant' ? 'assistant' : 'user'
}

const getFeedRole = (row: FeedEventRow, userId: string): FeedEventRole => {
  if (row.event_type === 'conversation') return getConversationRole(row)
  if (row.actor_type === 'voyager') return 'assistant'
  return getSenderUserId(row) === userId ? 'user' : 'human'
}

export const isInFeedContext = (
  row: FeedEventRow,
  userId: string,
  conversationId: string,
  voyageSlug: string | null,
) => {
  if (!row.participants?.includes(userId)) return false
  if (row.event_type === 'conversation') return getSessionId(row) === conversationId
  if (row.event_type !== 'message') return false
  return voyageSlug ? row.voyage_slug === voyageSlug : row.voyage_slug === null
}

export const toFeedEvents = (
  rows: FeedEventRow[],
  deliveries: DeliveryRow[],
  userId: string,
): FeedEvent[] => {
  const deliveryByEventId = new Map(deliveries.map((delivery) => [delivery.event_id, delivery]))

  return sortFeedEvents(rows.map((row) => {
    const role = getFeedRole(row, userId)
    const delivery = deliveryByEventId.get(row.id) ?? null
    const isSelfAuthoredMessage = row.event_type === 'message' && role === 'user'

    return {
      id: row.id,
      eventType: row.event_type as FeedEventType,
      role,
      senderDisplayName: role === 'assistant' ? 'Voyager' : getSenderDisplayName(row),
      senderUserId: getSenderUserId(row) ?? row.user_id,
      content: row.content ?? '',
      createdAt: row.created_at,
      seen: row.event_type !== 'message' || isSelfAuthoredMessage || Boolean(delivery?.seen_at),
      deliveryId: delivery?.id ?? null,
    }
  }))
}

export const getFeed = async (userId: string, conversationId: string): Promise<FeedEvent[]> => {
  const voyageSlug = await resolveSessionVoyage(conversationId, userId)
  const supabase = typedTable()

  let query = supabase
    .from('knowledge_events')
    .select('id,event_type,content,created_at,metadata,source_ref,actor_type,user_id,participants,voyage_slug')
    .in('event_type', ['conversation', 'message'])
    .contains('participants', [userId])
    // Recent-N cap: fetch newest 200, client sorts ascending. Bounds a long
    // history + the per-Realtime-insert refetch.
    .order('created_at', { ascending: false })
    .limit(200)

  query = voyageSlug ? query.eq('voyage_slug', voyageSlug) : query.is('voyage_slug', null)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = ((data ?? []) as FeedEventRow[])
    .filter((row) => isInFeedContext(row, userId, conversationId, voyageSlug))
  const messageIds = rows
    .filter((row) => row.event_type === 'message')
    .map((row) => row.id)

  if (messageIds.length === 0) return toFeedEvents(rows, [], userId)

  const { data: deliveries, error: deliveryError } = await supabase
    .from('message_deliveries')
    .select('id,event_id,seen_at')
    .eq('recipient_user_id', userId)
    .in('event_id', messageIds)

  if (deliveryError) throw new Error(deliveryError.message)
  return toFeedEvents(rows, (deliveries ?? []) as DeliveryRow[], userId)
}

export { SessionAccessError }
