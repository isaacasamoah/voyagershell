// The public-voice decision — cut ④. When a Voyager is summoned aloud in a room
// ("wren, what do you think?"), its reply must reach EVERYONE, attributed to the
// named agent, and its owner — not the summoner — must be the identity of record.
//
// Pure + isomorphic (no DB, no server imports), for the same reason address.ts is:
// the reply's participants/attribution is COMPUTED here and code-attested, never
// derived ad-hoc at the persist site. finishTurn calls planPublicReply once and
// persists exactly what it returns; run-turn feeds it the summoned voyager's owner.
//
// THE LOAD-BEARING FACT (the §6.5 trust boundary): the reply persists under the
// summoned voyager's OWNER user_id, as a `message` event with actor=voyager — NOT
// under the summoner, NOT merely "owner in metadata". stream-context then maps it
// correctly for free: the owner reads it role=assistant ("my Voyager spoke"),
// EVERYONE ELSE — including the summoner — reads it as an attributed `[Wren]` line,
// never as their own words. Persisting it as `conversation` OR under the summoner's
// id is the exact inversion bug where Wren's words become the reader's own turn.

import type { AddressMode } from './address'

export interface PublicReplyInput {
  /** How the incoming utterance addressed a voyager (address.ts classification). */
  mode: AddressMode
  /** Who POSTed the turn (ctx.userId) — the summoner. */
  summonerUserId: string
  /**
   * The summoned voyager's OWNER. Self-summon: === summonerUserId. Cross-owner
   * summon (Elisheya summons Isaac's Wren): the resolved owner of `targetHandle`.
   * This is the identity of record for the reply.
   */
  voyagerOwnerUserId: string
  /** The voyager's display name, e.g. "Wren" — rides sender_display_name. */
  voyagerName: string
  /** The owner's display name, e.g. "Isaac" — for "WREN ✦ (Isaac's Voyager)". */
  voyagerOwnerName: string
  /**
   * All ACTIVE room members, recomputed FRESH at reply time (turn-end), never a
   * turn-start snapshot — a member who joined/left during a long stream must be
   * fanned correctly. Solo (0 or 1 member) ⇒ no fan-out.
   */
  activeMemberIds: string[]
}

export interface PublicReplyPlan {
  /** True ⇒ persist as a public room message + fanOutDeliveries to recipients. */
  fanOut: boolean
  /** 'message' for a public fan-out (the attributed-`[Wren]` mapping branch);
   *  'conversation' for a solo/aside reply (private to the asker, unchanged). */
  eventType: 'message' | 'conversation'
  /** The role passed to createMessageEvent — always 'assistant' ⇒ actor=voyager. */
  role: 'assistant'
  /** The row's user_id — ALWAYS the voyager's owner (the §6.5 pin). */
  userId: string
  /** Feed-visibility scope: all active members for a fan-out; [asker] otherwise. */
  participants: string[]
  /** fanOutDeliveries targets: active members minus the owner (never empty on a
   *  fan-out); [] when private. */
  recipients: string[]
  /** Attribution carried in metadata for the WREN ✦ render; undefined when private
   *  so a solo reply stays the flat "Voyager". */
  senderDisplayName?: string
  ownerDisplayName?: string
  /** 'room' marks the public path (parity with the human room-message wire). */
  source?: string
}

/**
 * Decide how a Voyager's reply is persisted and fanned. A public summon in a
 * populated room fans out under the owner; everything else (aside, solo) stays
 * the private per-asker reply that shipped before cut ④.
 */
export const planPublicReply = (input: PublicReplyInput): PublicReplyPlan => {
  const { mode, summonerUserId, voyagerOwnerUserId, voyagerName, voyagerOwnerName, activeMemberIds } = input

  // fanOutDeliveries goes to everyone active EXCEPT the owner (the owner reads the
  // reply as their own assistant turn; a self-authored line needs no delivery row).
  const recipients = activeMemberIds.filter((id) => id !== voyagerOwnerUserId)

  // Public voice fires ONLY for a leading-name summon with a real audience. An
  // aside (`@wren`) or a solo turn is never fanned — the private branch below.
  const fanOut = mode === 'summon' && recipients.length > 0

  if (!fanOut) {
    return {
      fanOut: false,
      eventType: 'conversation',
      role: 'assistant',
      userId: voyagerOwnerUserId, // self-summon: owner === summoner; aside is own-only
      participants: [summonerUserId],
      recipients: [],
      // A reply to an `@handle` aside is itself private — mark it so the feed can
      // give BOTH the whisper and its reply the "private to you" treatment. The
      // whisper already persists source:'aside' (room-turn.ts); without this the
      // reply landed as an unmarked `conversation` event, indistinguishable from a
      // solo reply, so half the aside read like an ordinary room line. A solo
      // ('plain') reply carries no aside marker.
      source: mode === 'aside' ? 'aside' : undefined,
    }
  }

  return {
    fanOut: true,
    eventType: 'message',
    role: 'assistant',
    userId: voyagerOwnerUserId,
    participants: [voyagerOwnerUserId, ...recipients], // = all active members
    recipients,
    // An UNNAMED voyager (voyagerName === '') must persist NO sender_display_name,
    // not an empty string: stream-context's `getSenderDisplayName(row) ?? 'Voyager'`
    // fallback only fires on null/undefined, so a persisted '' would strip the
    // `[Voyager]:` attribution and read back as the reader's OWN words (the §6.5
    // inversion). Undefined lets the fallback attribute it; render then shows the
    // flat "VOYAGER" with no owner line, exactly as a solo reply does.
    senderDisplayName: voyagerName || undefined,
    ownerDisplayName: voyagerName ? voyagerOwnerName : undefined,
    source: 'room',
  }
}

// ── The loop guard (the hard rule, code-attested) ────────────────────────────
// "actor=voyager events NEVER trigger another Voyager's turn." A Voyager turn may
// begin ONLY on human-authored input. Today that holds by architecture (a turn is
// only ever a human POST /api/chat; nothing converts a received event into a POST)
// — but the invariant lives NOWHERE in code, so an added realtime→turn bridge
// would break it silently. This predicate is where any turn-trigger MUST gate:
// the fanned reply is stamped actor=voyager (role='assistant' above), so feeding
// it back through here can never open a turn. Two named Voyagers cannot answer
// each other unbidden.
export const isHumanTurnInput = (actorType: string): boolean => actorType === 'user'
