import type { Json } from '@/lib/supabase/types'
import {
  emptyFeedEnrichment,
  type FeedEnrichment,
} from './feed-enrichment'
import {
  sortFeedEvents,
  type FeedEvent,
  type FeedEventKind,
  type FeedEventRole,
  type FeedEventType,
  type InviteMembershipState,
} from './feed-types'

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

export interface DeliveryRow {
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
  const metadataSessionId = isObject(row.metadata)
    ? getString(row.metadata, 'session_id')
    : null
  if (metadataSessionId) return metadataSessionId
  return isObject(row.source_ref)
    ? getString(row.source_ref, 'conversation_id')
    : null
}

const getSenderUserId = (row: FeedEventRow): string | null => (
  isObject(row.metadata) ? getString(row.metadata, 'sender_user_id') : null
)
const getSenderDisplayName = (row: FeedEventRow): string | null => (
  isObject(row.metadata) ? getString(row.metadata, 'sender_display_name') : null
)
export const getInviteSpaceId = (row: FeedEventRow): string | null => (
  isObject(row.metadata) ? getString(row.metadata, 'space_id') : null
)
const getOwnerDisplayName = (row: FeedEventRow): string | null => (
  isObject(row.metadata) ? getString(row.metadata, 'owner_display_name') : null
)
export const getFeedKind = (row: FeedEventRow): FeedEventKind => {
  const source = isObject(row.metadata) ? getString(row.metadata, 'source') : null
  if (source === 'invite') return 'invite'
  if (source === 'join') return 'system'
  return 'message'
}
export const getConversationRole = (row: FeedEventRow): FeedEventRole => {
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
  if (row.event_type === 'conversation') {
    return getFeedEventSessionId(row) === conversationId
  }
  if (row.event_type !== 'message') return false
  return voyageSlug ? row.voyage_slug === voyageSlug : row.voyage_slug === null
}

export const toFeedEvents = (
  rows: FeedEventRow[],
  deliveries: DeliveryRow[],
  userId: string,
  viewerInviteStates: ReadonlyMap<string, InviteMembershipState> = new Map(),
  enrichment: FeedEnrichment = emptyFeedEnrichment(),
): FeedEvent[] => {
  const deliveryByEventId = new Map(
    deliveries.map((delivery) => [delivery.event_id, delivery]),
  )
  return sortFeedEvents(rows.map((row) => {
    const role = getFeedRole(row, userId)
    const kind = getFeedKind(row)
    const inviteSpaceId = kind === 'invite' ? getInviteSpaceId(row) : null
    const inviteMembership = inviteSpaceId
      ? viewerInviteStates.get(inviteSpaceId) ?? null
      : null
    const delivery = deliveryByEventId.get(row.id) ?? null
    const isSelfAuthoredMessage = row.event_type === 'message' && role === 'user'
    const isOwnVoyagerMessage =
      row.event_type === 'message'
      && row.actor_type === 'voyager'
      && row.user_id === userId
    const isOwnerPrivateAssistant =
      row.event_type === 'conversation'
      && role === 'assistant'
      && row.user_id === userId
    return {
      id: row.id,
      eventType: row.event_type as FeedEventType,
      role,
      kind,
      inviteState: inviteSpaceId && inviteMembership
        ? { membership: inviteMembership, spaceId: inviteSpaceId }
        : null,
      senderDisplayName: isOwnerPrivateAssistant
        ? enrichment.currentVoyagerDisplayName
        : getSenderDisplayName(row),
      ownerName: role === 'assistant' ? getOwnerDisplayName(row) : null,
      senderUserId: getSenderUserId(row) ?? row.user_id,
      content: row.content ?? '',
      createdAt: row.created_at,
      shared: isOwnerPrivateAssistant
        && enrichment.sharedSourceEventIds.has(row.id),
      seen: row.event_type !== 'message'
        || isSelfAuthoredMessage
        || isOwnVoyagerMessage
        || Boolean(delivery?.seen_at),
      deliveryId: delivery?.id ?? null,
    }
  }))
}
