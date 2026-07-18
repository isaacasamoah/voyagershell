import type { StreamTextResult, ToolSet } from 'ai'
import type { AuthState } from '@/lib/prompts'
import type { AddressMode } from '@/lib/messaging/address'

// cut ④ — the resolved summon, computed once in run-turn and carried into
// finishTurn so the reply persists + fans out under the SUMMONED voyager's OWNER
// (§6.5), never the summoner. For a plain/aside/self turn the owner IS the
// summoner, so this collapses to the private per-asker reply that shipped before.
export interface SummonResolution {
  mode: AddressMode
  /** Who POSTed the turn — ctx.userId. */
  summonerUserId: string
  /** The summoned voyager's owner — the identity of record for the reply. */
  voyagerOwnerUserId: string
  /** The summoned voyager's custom name (title-cased), or null when unnamed. */
  voyagerName: string | null
  /** The owner's display name, for "WREN ✦ (Isaac's Voyager)". */
  voyagerOwnerName: string
}

export interface TurnContext {
  userId: string
  conversationId?: string
  voyageSlug: string | null
  authState?: AuthState
  autoSent?: boolean
  newMessage: string
  displayName?: string
  // cut ④ loop guard: the actor_type of the input that OPENED this turn. A turn
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
