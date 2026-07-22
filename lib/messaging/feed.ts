import type { Json } from '@/lib/supabase/types'
import { SessionAccessError, resolveSessionVoyage } from '@/lib/voyage'
import { emptyFeedEnrichment, getFeedTableClient, loadPrivateFeedEnrichment, resolveViewerInviteState, type FeedEnrichment } from './feed-enrichment'
import { sortFeedEvents, type FeedEvent, type FeedEventKind, type FeedEventRole, type FeedEventType, type InviteState } from './feed-types'

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

const isObject = (value: Json | null): value is JsonRecord => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

const getString = (value: JsonRecord, key: string): string | null => {
  const item = value[key]
  return typeof item === 'string' ? item : null
}

export const getFeedEventSessionId = (row: FeedEventRow): string | null => {
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

// Historical public Voyager rows retain their owner attribution. New writes do
// not use this field, but immutable ledger history must remain readable.
const getOwnerDisplayName = (row: FeedEventRow): string | null => (
  isObject(row.metadata) ? getString(row.metadata, 'owner_display_name') : null
)

// Message events carry a `source` marker: 'invite' → interactive knock,
// 'join' → a system line ("X joined the room"); anything else is a plain message.
const getFeedKind = (row: FeedEventRow): FeedEventKind => {
  const source = isObject(row.metadata) ? getString(row.metadata, 'source') : null
  if (source === 'invite') return 'invite'
  if (source === 'join') return 'system'
  return 'message'
}

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
  if (row.event_type === 'conversation') return getFeedEventSessionId(row) === conversationId
  if (row.event_type !== 'message') return false
  return voyageSlug ? row.voyage_slug === voyageSlug : row.voyage_slug === null
}

export const toFeedEvents = (
  rows: FeedEventRow[],
  deliveries: DeliveryRow[],
  userId: string,
  viewerInviteState: InviteState | null = null,
  enrichment: FeedEnrichment = emptyFeedEnrichment(),
): FeedEvent[] => {
  const deliveryByEventId = new Map(deliveries.map((delivery) => [delivery.event_id, delivery]))

  return sortFeedEvents(rows.map((row) => {
    const role = getFeedRole(row, userId)
    const kind = getFeedKind(row)
    const delivery = deliveryByEventId.get(row.id) ?? null
    const isSelfAuthoredMessage = row.event_type === 'message' && role === 'user'
    // Historical owner-authored public Voyager rows had no self-delivery.
    const isOwnVoyagerMessage =
      row.event_type === 'message' && row.actor_type === 'voyager' && row.user_id === userId
    const isOwnerPrivateAssistant =
      row.event_type === 'conversation' && role === 'assistant' && row.user_id === userId

    return {
      id: row.id,
      eventType: row.event_type as FeedEventType,
      role,
      kind,
      inviteState: kind === 'invite' ? viewerInviteState : null,
      // Private conversation history always reflects the owner's canonical
      // current companion identity. Historical public Voyager metadata remains
      // immutable and continues to render its stored attribution.
      senderDisplayName: isOwnerPrivateAssistant
        ? enrichment.currentVoyagerDisplayName
        : getSenderDisplayName(row),
      ownerName: role === 'assistant' ? getOwnerDisplayName(row) : null,
      senderUserId: getSenderUserId(row) ?? row.user_id,
      content: row.content ?? '',
      createdAt: row.created_at,
      shared: isOwnerPrivateAssistant && enrichment.sharedSourceEventIds.has(row.id),
      seen: row.event_type !== 'message' || isSelfAuthoredMessage || isOwnVoyagerMessage || Boolean(delivery?.seen_at),
      deliveryId: delivery?.id ?? null,
    }
  }))
}

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
    // Recent-N cap: fetch newest N, client sorts ascending. Bounds a long
    // history + the per-Realtime-insert refetch.
    .order('created_at', { ascending: false })
    .limit(limit)

  query = scopedVoyageSlug ? query.eq('voyage_slug', scopedVoyageSlug) : query.is('voyage_slug', null)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return ((data ?? []) as FeedEventRow[])
    .filter((row) => isInFeedContext(row, userId, conversationId, scopedVoyageSlug))
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
    // createMessageEvent writes metadata.session_id and source_ref.conversation_id together; getFeedEventSessionId still prefers metadata.
    .in('source_ref->>conversation_id', conversationIds)
    .order('created_at', { ascending: false })
    .limit(limit)

  query = voyageSlug ? query.eq('voyage_slug', voyageSlug) : query.is('voyage_slug', null)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return ((data ?? []) as FeedEventRow[]).filter((row) => {
    const eventConversationId = getFeedEventSessionId(row)
    return Boolean(eventConversationId && conversationIdSet.has(eventConversationId))
      && row.participants?.includes(userId) === true
      && (row.event_type === 'conversation' || row.event_type === 'message')
  })
}

export const getFeed = async (userId: string, conversationId: string): Promise<FeedEvent[]> => {
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

  // Only pay the membership lookup when a knock is actually on screen.
  const hasInvite = rows.some((row) => getFeedKind(row) === 'invite')
  const viewerInviteState = hasInvite && voyageSlug
    ? await resolveViewerInviteState(supabase, voyageSlug, userId)
    : null
  const [enrichment, deliveryResult] = await Promise.all([
    loadPrivateFeedEnrichment(supabase, userId, conversationId, privateAssistantIds),
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
    viewerInviteState,
    enrichment,
  )
}

export { SessionAccessError }
