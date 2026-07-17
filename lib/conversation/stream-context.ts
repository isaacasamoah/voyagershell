import { queryScopedEvents, type FeedEventRow } from '@/lib/messaging/feed'
import { sortFeedEvents, type FeedEvent } from '@/lib/messaging/feed-types'
import type { Json, MessageRole } from '@/lib/supabase/types'

type JsonRecord = { [key: string]: Json | undefined }

interface StreamConversationMessage {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  createdAt: Date
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
  && row.participants?.length === 1
  && row.participants[0] === userId
)

const attributedContent = (row: FeedEventRow, content: string): string => {
  const displayName = getSenderDisplayName(row)
    ?? (row.actor_type === 'voyager' ? 'Voyager' : null)
    ?? row.user_id
    ?? 'Someone'
  return `[${displayName}]: ${content}`
}

const mapStreamEventToMessage = (
  row: FeedEventRow,
  userId: string,
  conversationId: string,
): StreamConversationMessage => {
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
      content: isPrivateUserTurn(row, userId) ? `[PRIVATE]: ${content}` : content,
      createdAt: new Date(row.created_at),
    }
  }

  if (row.actor_type === 'voyager') {
    const ownerIsViewer = row.user_id === userId
    return {
      id: row.id,
      conversationId: rowConversationId,
      role: ownerIsViewer ? 'assistant' : 'user',
      content: ownerIsViewer ? content : attributedContent(row, content),
      createdAt: new Date(row.created_at),
    }
  }

  const senderUserId = getSenderUserId(row) ?? row.user_id
  const authoredByViewer = senderUserId === userId
  return {
    id: row.id,
    conversationId: rowConversationId,
    role: 'user',
    content: authoredByViewer ? content : attributedContent(row, content),
    createdAt: new Date(row.created_at),
  }
}

export const composeContextFromStream = async (
  userId: string,
  conversationId: string,
  voyageSlug: string | null,
): Promise<StreamConversationMessage[]> => {
  const rows = await queryScopedEvents(userId, conversationId, voyageSlug)
  return sortRowsLikeFeed(rows).map((row) => mapStreamEventToMessage(row, userId, conversationId))
}
