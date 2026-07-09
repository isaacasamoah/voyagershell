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

// Epoch comparison — feed events can mix DB (`+00:00`) and client-optimistic
// (`Z`) timestamp formats; string compare would mis-order across formats.
const compareFeedEvents = (a: FeedEvent, b: FeedEvent) => {
  const byCreatedAt = Date.parse(a.createdAt) - Date.parse(b.createdAt)
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
    && (!startedAt || Date.parse(event.createdAt) >= Date.parse(startedAt))
  ))
}

export const shouldShowStreamingReply = (
  reply: StreamingReply | null,
  events: FeedEvent[],
): reply is StreamingReply => (
  Boolean(reply?.content.trim())
  && !hasSettledAssistantEvent(events, reply?.content ?? '', reply?.startedAt)
)

// The auto-sent hidden welcome ("good morning") is never persisted, so it must
// never render as an optimistic user turn either.
const WELCOME_RE = /^good (morning|afternoon|evening)\b/i

// Show a just-sent user message as an optimistic transient until its own
// 'conversation' event lands in the feed (avoids the send→round-trip vanish),
// excluding the hidden welcome.
export const shouldShowOptimisticUser = (content: string, events: FeedEvent[]): boolean => {
  const normalized = content.trim()
  if (!normalized || WELCOME_RE.test(normalized)) return false
  return !events.some((e) => e.role === 'user' && e.content.trim() === normalized)
}
