import { resolveAddress } from './address'

export type FeedEventType = 'conversation' | 'message'
export type FeedEventRole = 'user' | 'assistant' | 'human'
// A knock is a message event whose metadata.source === 'invite'; a 'system'
// line (e.g. "X joined the room") is metadata.source === 'join'. Orthogonal to
// role — the recipient sees them as 'human' events; `kind` marks how to render.
export type FeedEventKind = 'message' | 'invite' | 'system'
export type InviteState = 'invited' | 'active' | 'left'

export interface FeedEvent {
  id: string
  eventType: FeedEventType
  role: FeedEventRole
  kind: FeedEventKind
  // The viewer's own membership state for the invite's space. Only meaningful
  // when kind === 'invite'; drives whether the Join/Decline buttons show.
  inviteState: InviteState | null
  senderDisplayName: string | null
  // Historical public Voyager attribution. New Voyager output is private.
  ownerName: string | null
  senderUserId: string | null
  content: string
  createdAt: string
  // Server-derived publication state for an owner-private assistant event in
  // the current destination room. Never inferred from component history.
  shared: boolean
  seen: boolean
  deliveryId: string | null
}

export interface FeedApiEvent {
  id: string
  event_type: FeedEventType
  role: FeedEventRole
  kind: FeedEventKind
  invite_state: InviteState | null
  sender_display_name: string | null
  owner_name: string | null
  sender_user_id: string | null
  content: string
  created_at: string
  shared: boolean
  seen: boolean
  delivery_id: string | null
}

export interface StreamingReply {
  id: string
  // How many assistant events were already in the feed when this reply began
  // streaming. The transient is dismissed once the feed holds MORE than this —
  // i.e. this turn's own persisted reply has landed. Count-based reconciliation
  // is immune to content normalization and client/server clock skew, both of
  // which broke the old exact-content match and left the reply pinned forever.
  settledCount: number
}

interface StreamingReplyTransition {
  assistantId: string | null
  hasRenderableOutput: boolean
  isStreaming: boolean
  assistantEventCount: number
}

// One explicit state transition for the live assistant lane. This is invoked
// only from primitive effect dependencies; AI SDK array/object identity is not
// part of the lifecycle contract.
export const advanceStreamingReply = (
  previous: StreamingReply | null,
  transition: StreamingReplyTransition,
): StreamingReply | null => {
  const {
    assistantId,
    hasRenderableOutput,
    isStreaming,
    assistantEventCount,
  } = transition
  if (!assistantId || !hasRenderableOutput) return previous
  if (!isStreaming && previous?.id !== assistantId) return previous
  if (previous?.id === assistantId) return previous
  return {
    id: assistantId,
    settledCount: assistantEventCount,
  }
}

export const settleStreamingReply = (
  previous: StreamingReply | null,
  assistantEventCount: number,
): StreamingReply | null => (
  previous && assistantEventCount > previous.settledCount ? null : previous
)

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
  kind: event.kind,
  invite_state: event.inviteState,
  sender_display_name: event.senderDisplayName,
  owner_name: event.ownerName,
  sender_user_id: event.senderUserId,
  content: event.content,
  created_at: event.createdAt,
  shared: event.shared,
  seen: event.seen,
  delivery_id: event.deliveryId,
})

export const fromFeedApiEvent = (event: FeedApiEvent): FeedEvent => ({
  id: event.id,
  eventType: event.event_type,
  role: event.role,
  kind: event.kind ?? 'message',
  inviteState: event.invite_state ?? null,
  senderDisplayName: event.sender_display_name,
  ownerName: event.owner_name ?? null,
  senderUserId: event.sender_user_id,
  content: event.content,
  createdAt: event.created_at,
  shared: event.shared ?? false,
  seen: event.seen,
  deliveryId: event.delivery_id,
})

// Each assistant turn persists exactly one assistant feed event. Counting them
// is the reconciliation key — no fragile string compare, no clock arithmetic.
export const countAssistantEvents = (events: FeedEvent[]): number => (
  events.reduce((n, event) => (event.role === 'assistant' ? n + 1 : n), 0)
)

// Show the live streaming transient only until this turn's own persisted reply
// lands — detected as one MORE assistant event than existed when it started.
export const shouldShowStreamingReply = (
  reply: StreamingReply | null,
  events: FeedEvent[],
): reply is StreamingReply => (
  Boolean(reply)
  && countAssistantEvents(events) <= (reply?.settledCount ?? 0)
)

// The auto-sent hidden welcome ("good morning") is never persisted, so it must
// never render as an optimistic user turn either.
const WELCOME_RE = /^good (morning|afternoon|evening)\b/i

// `@<handle> …` asides are persisted STRIPPED by the server (runTurn removes the
// prefix via resolveAddress before saving). The client must compare the same
// shape, or the optimistic message never settles and the composer wedges into
// queue mode. ONE source for the strip — the SAME resolver the server uses, so
// the classification can never drift. `ownHandle` is the caller's own voyager
// handle (claimed name or derived default); without it a named `@wren` aside
// would strip nothing client-side while the server stripped it — the wedge. The
// `voyager` alias still carries the common `@voyager` case even when '' is passed.
export const stripVoyagerAside = (text: string, ownHandle = ''): string => {
  const result = resolveAddress(text, { ownVoyagerHandle: ownHandle, ownVoyagerAliases: ['voyager'] })
  return result.mode === 'aside' ? result.stripped : text.trim()
}

// Show a just-sent user message as an optimistic transient until its own
// 'conversation' event lands in the feed (avoids the send→round-trip vanish),
// excluding the hidden welcome. Compares aside-stripped content on both sides —
// against the caller's OWN handle — so a settled `@wren …` aside releases its
// optimistic twin instead of wedging the composer.
// (Interim until the HarnessEvent turn-done signal — the seam owns the real close.)
export const shouldShowOptimisticUser = (
  content: string,
  events: FeedEvent[],
  ownHandle = '',
): boolean => {
  const normalized = stripVoyagerAside(content, ownHandle)
  if (!normalized || WELCOME_RE.test(normalized)) return false
  return !events.some((e) => e.role === 'user' && stripVoyagerAside(e.content, ownHandle) === normalized)
}

// The optimistic LIVE lane may only show text typed in THIS client since load.
// Hydrated messages (restored from the stream) are settled history — and after
// role-flattening they can carry OTHER people's words under role 'user', so
// surfacing one as "YOU" mis-attributes it to the viewer.
export const isHydratedMessage = (message: { metadata?: unknown }): boolean => (
  typeof message.metadata === 'object'
  && message.metadata !== null
  && (message.metadata as { hydrated?: boolean }).hydrated === true
)
