import { queryScopedEvents, type FeedEventRow } from '@/lib/messaging/feed'
import { sortFeedEvents, type FeedEvent } from '@/lib/messaging/feed-types'
import type { Json, MessageRole } from '@/lib/supabase/types'

type JsonRecord = { [key: string]: Json | undefined }

export interface ConversationMessage {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  createdAt: Date
  authorDisplayName?: string | null
  authorUserId?: string | null
  isPrivate?: boolean
}

const isObject = (value: Json | null): value is JsonRecord => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
)

const getString = (value: JsonRecord, key: string): string | null => {
  const item = value[key]
  return typeof item === 'string' ? item : null
}

const getSourceRole = (row: FeedEventRow): MessageRole => {
  const role = isObject(row.source_ref) ? getString(row.source_ref, 'role') : null
  return role === 'assistant' ? 'assistant' : 'user'
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

const sortRowsLikeFeed = (rows: FeedEventRow[]): FeedEventRow[] => {
  const byId = new Map(rows.map((row) => [row.id, row]))
  return sortFeedEvents(rows.map((row): FeedEvent => ({
    id: row.id,
    eventType: row.event_type as FeedEvent['eventType'],
    role: 'user',
    kind: 'message',
    inviteState: null,
    senderDisplayName: null,
    ownerName: null,
    senderUserId: null,
    content: row.content ?? '',
    createdAt: row.created_at,
    seen: true,
    deliveryId: null,
  }))).map((event) => byId.get(event.id)!)
}

const isPrivateUserTurn = (row: FeedEventRow, userId: string): boolean => (
  row.event_type === 'conversation'
  && getSourceRole(row) === 'user'
  && row.participants?.includes(userId) === true
  && isObject(row.metadata)
  && getString(row.metadata, 'source') === 'aside'
)

const getAttributionName = (row: FeedEventRow): string => (
  getSenderDisplayName(row)
    ?? (row.actor_type === 'voyager' ? 'Voyager' : null)
    ?? row.user_id
    ?? 'Someone'
)

const mapStreamEventToMessage = (
  row: FeedEventRow,
  userId: string,
  conversationId: string,
): ConversationMessage => {
  const content = row.content ?? ''
  const rowConversationId = getSessionId(row) ?? conversationId

  if (row.event_type === 'conversation') {
    const role = getSourceRole(row) === 'assistant' && row.actor_type === 'voyager'
      ? 'assistant'
      : 'user'
    return {
      id: row.id,
      conversationId: rowConversationId,
      role,
      content,
      createdAt: new Date(row.created_at),
      authorUserId: row.user_id,
      isPrivate: isPrivateUserTurn(row, userId),
    }
  }

  if (row.actor_type === 'voyager') {
    const ownerIsViewer = row.user_id === userId
    return {
      id: row.id,
      conversationId: rowConversationId,
      role: ownerIsViewer ? 'assistant' : 'user',
      content,
      createdAt: new Date(row.created_at),
      authorDisplayName: ownerIsViewer ? null : getAttributionName(row),
      authorUserId: row.user_id,
      isPrivate: false,
    }
  }

  const senderUserId = getSenderUserId(row) ?? row.user_id
  const authoredByViewer = senderUserId === userId
  return {
    id: row.id,
    conversationId: rowConversationId,
    role: 'user',
    content,
    createdAt: new Date(row.created_at),
    authorDisplayName: authoredByViewer ? null : getAttributionName(row),
    authorUserId: senderUserId,
    isPrivate: false,
  }
}

export const renderMessagesForModel = <T extends ConversationMessage>(messages: T[]): T[] => (
  messages.map((message) => {
    const content = message.isPrivate
      ? `[PRIVATE]: ${message.content}`
      : message.authorDisplayName
        ? `[${message.authorDisplayName}]: ${message.content}`
        : message.content
    return { ...message, content }
  })
)

export const composeContextRows = (
  rows: FeedEventRow[],
  userId: string,
  conversationId: string,
): ConversationMessage[] => (
  sortRowsLikeFeed(rows).map((row) => mapStreamEventToMessage(row, userId, conversationId))
)

export const composeContextFromStream = async (
  userId: string,
  conversationId: string,
  voyageSlug: string | null,
  limit = 200,
): Promise<ConversationMessage[]> => {
  const rows = await queryScopedEvents(userId, conversationId, voyageSlug, limit)
  return composeContextRows(rows, userId, conversationId)
}
