import type { StreamTextResult, ToolSet } from 'ai'
import type { AuthState } from '@/lib/prompts'
export interface TurnContext {
  userId: string
  conversationId?: string
  voyageSlug: string | null
  authState?: AuthState
  autoSent?: boolean
  newMessage: string
  displayName?: string
  // The client's own id for this send. It is the exactly-once key: a retry of
  // the same message reuses it, so the ingress claim recognises the retry and
  // refuses to write a second event, delivery set or model call. Absent only
  // for callers that predate it, which fall back to the session id.
  clientMessageId?: string
  // Loop guard: the actor_type of the input that OPENED this turn. A turn
  // may begin ONLY on human-authored input ('user'); an actor=voyager event must
  // NEVER trigger another Voyager's turn. Defaults to 'user' (the human POST is
  // the only caller today) — a future realtime→turn bridge that forwards a
  // voyager event must set this honestly, and runTurn's gate will reject it.
  originatorActorType?: string
}

export interface HarnessHost {
  defer(promise: Promise<unknown>): void
  now(): Date
}

export type TurnResult =
  | { kind: 'stream'; result: StreamTextResult<ToolSet, any> }
  | { kind: 'text'; text: string }
  | { kind: 'empty' }
