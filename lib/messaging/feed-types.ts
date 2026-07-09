export type FeedEventType = 'conversation' | 'message'
export type FeedEventRole = 'user' | 'assistant' | 'human'

export interface FeedEvent {
  id: string
  eventType: FeedEventType
  role: FeedEventRole
  senderDisplayName: string | null
  senderUserId: string | null
  content: string
  createdAt: string
  seen: boolean
  deliveryId: string | null
}

export interface FeedApiEvent {
  id: string
  event_type: FeedEventType
  role: FeedEventRole
  sender_display_name: string | null
  sender_user_id: string | null
  content: string
  created_at: string
  seen: boolean
  delivery_id: string | null
}

export interface StreamingReply {
  id: string
  content: string
  startedAt: string
}

const compareFeedEvents = (a: FeedEvent, b: FeedEvent) => {
  const byCreatedAt = a.createdAt.localeCompare(b.createdAt)
  if (byCreatedAt !== 0) return byCreatedAt
  return a.id.localeCompare(b.id)
}

export const sortFeedEvents = (events: FeedEvent[]): FeedEvent[] => (
  [...events].sort(compareFeedEvents)
)

export const mergeFeedEvent = (events: FeedEvent[], event: FeedEvent): FeedEvent[] => {
  const byId = new Map(events.map((item) => [item.id, item]))
  byId.set(event.id, event)
  return sortFeedEvents(Array.from(byId.values()))
}

export const toFeedApiEvent = (event: FeedEvent): FeedApiEvent => ({
  id: event.id,
  event_type: event.eventType,
  role: event.role,
  sender_display_name: event.senderDisplayName,
  sender_user_id: event.senderUserId,
  content: event.content,
  created_at: event.createdAt,
  seen: event.seen,
  delivery_id: event.deliveryId,
})

export const fromFeedApiEvent = (event: FeedApiEvent): FeedEvent => ({
  id: event.id,
  eventType: event.event_type,
  role: event.role,
  senderDisplayName: event.sender_display_name,
  senderUserId: event.sender_user_id,
  content: event.content,
  createdAt: event.created_at,
  seen: event.seen,
  deliveryId: event.delivery_id,
})

export const hasSettledAssistantEvent = (
  events: FeedEvent[],
  content: string,
  startedAt?: string,
): boolean => {
  const normalized = content.trim()
  if (!normalized) return false

  return events.some((event) => (
    event.role === 'assistant'
    && event.content.trim() === normalized
    && (!startedAt || event.createdAt >= startedAt)
  ))
}

export const shouldShowStreamingReply = (
  reply: StreamingReply | null,
  events: FeedEvent[],
): reply is StreamingReply => (
  Boolean(reply?.content.trim())
  && !hasSettledAssistantEvent(events, reply?.content ?? '', reply?.startedAt)
)
