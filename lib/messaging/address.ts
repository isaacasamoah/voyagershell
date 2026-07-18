// The addressing grammar — the ONE code-attested resolver for how an utterance
// addresses a Voyager. This is the trust boundary from Principle 1: an `@`-aside
// can ONLY ever reach the speaker's OWN voyager, and that fact is COMPUTED here,
// never model-guessed (the rule the invite bug violated).
//
// Pure + isomorphic: no DB, no server imports. The client (composer badge) and
// the server (reply gate) both resolve through this same function, so the
// privacy classification can never drift between what you see and what happens.
//
// Generalizes what shipped as two literal-`voyager` sites: the `@voyager` aside
// (feed-types) and the leading-`voyager` summon regex (room-turn). `voyager`
// survives only as an alias for "your own".

export type AddressMode = 'aside' | 'summon' | 'redirect' | 'plain'

// A voyager handle visible to the speaker in the current room. `isOwn` is the
// trust boundary — the ONLY thing that authorizes a private aside.
export interface VoyagerHandle {
  handle: string     // normalized, e.g. 'wren' or 'isaac.voyager'
  ownerName: string  // owner's display name, for the redirect line
  isOwn: boolean
}

export interface AddressContext {
  // The speaker's own voyager handle (claimed name or derived `<username>.voyager`).
  // Empty string when the user has no username yet — the `voyager` alias still carries it.
  ownVoyagerHandle: string
  ownVoyagerAliases?: string[]         // legacy aliases for your own voyager, e.g. ['voyager']
  roomVoyagerHandles?: VoyagerHandle[] // every voyager handle in the room, own included
}

export interface AddressResult {
  mode: AddressMode
  targetHandle?: string      // summon / redirect target
  targetOwnerName?: string   // redirect line: "Wren is <ownerName>'s…"
  stripped: string           // message with the leading address token removed
}

// Greedy handle-token read: consumes the WHOLE leading run of handle chars, so
// `wrench` never matches `wren` — the substring footgun dies at tokenization,
// not at a fragile per-handle regex. Returns the lowercased token, or null.
const HANDLE_TOKEN = /^[a-z0-9_.-]+/i
const GREETING = /^(hey|hi|ok|okay)\s+/i
const LEADING_SEP = /^[\s,:;!.?…—-]+/

const readHandleToken = (s: string): string | null => {
  const match = HANDLE_TOKEN.exec(s)
  return match ? match[0].toLowerCase() : null
}

// Handle candidates from a greedy token, longest first: the whole token, then
// each prefix cut at a `.`/`-`/`_` separator boundary. `wren.actually` →
// ['wren.actually', 'wren']; `wren.voyager` → ['wren.voyager', 'wren'].
//
// This rescues an own-aside whose handle has trailing punctuation glued to it
// with no space — `@wren.actually secret` — where the greedy token isn't a
// handle but its separator-terminated prefix `wren` is. Without it the aside
// silently downgrades to a published `plain` and fans out to the room: an
// intended private whisper made public (a confidentiality regression on C1/C5).
//
// Only SEPARATOR-terminated prefixes are tried, so the `wrench` ≠ `wren`
// substring guard stays intact — `wrench` has no separator, so no shorter
// prefix is ever considered. Every candidate is still checked through the
// same isOwn / otherVoyager gates below, so C1 holds by construction: a
// candidate can only ever open an aside for the SPEAKER'S OWN handle.
const handleCandidates = (token: string): string[] => {
  const out = [token]
  const sep = /[._-]/g
  const cuts: number[] = []
  let m: RegExpExecArray | null
  while ((m = sep.exec(token)) !== null) cuts.push(m.index)
  for (let i = cuts.length - 1; i >= 0; i--) {
    const prefix = token.slice(0, cuts[i])
    if (prefix) out.push(prefix)
  }
  return out
}

const stripLeading = (text: string, consumed: number): string =>
  text.slice(consumed).replace(LEADING_SEP, '').trim()

const normalize = (s: string): string => s.trim().toLowerCase()

export const resolveAddress = (raw: string, ctx: AddressContext): AddressResult => {
  const text = raw.trim()

  const ownSet = new Set(
    [ctx.ownVoyagerHandle, ...(ctx.ownVoyagerAliases ?? [])]
      .map(normalize)
      .filter((h) => h.length > 0),
  )
  const roomVoyagers = new Map(
    (ctx.roomVoyagerHandles ?? []).map((v) => [normalize(v.handle), v]),
  )
  const isOwn = (handle: string): boolean => ownSet.has(handle)
  const otherVoyager = (handle: string): VoyagerHandle | undefined => {
    const v = roomVoyagers.get(handle)
    return v && !v.isOwn ? v : undefined
  }

  // ── `@handle …` — the private-aside path ──────────────────────────────────
  if (text.startsWith('@')) {
    const token = readHandleToken(text.slice(1))
    if (!token) return { mode: 'plain', stripped: text }

    // Longest known handle first: a full-token match (own or another's) wins
    // over a shorter separator-boundary prefix, so an explicit `@other.voyager`
    // still redirects rather than aside-matching a `@other` prefix.
    for (const cand of handleCandidates(token)) {
      if (isOwn(cand)) {
        // Aside to your own voyager — the whisper. Only you ever see it. The
        // aside carries no targetHandle: it ALWAYS routes to the speaker's own
        // voyager, so `@voyager` and `@wren` stay identical results (C3).
        return { mode: 'aside', stripped: stripLeading(text, 1 + cand.length) }
      }
      const other = otherVoyager(cand)
      if (other) {
        // `@` another person's voyager NEVER opens a private channel — the whole
        // point of C1. Redirect, keep the text intact for public fall-through.
        return {
          mode: 'redirect',
          targetHandle: cand,
          targetOwnerName: other.ownerName,
          stripped: text,
        }
      }
    }
    // `@human` or unknown `@token` — not an aside. Plain passthrough.
    return { mode: 'plain', stripped: text }
  }

  // ── `<handle>, …` — the public-summon path (leading name, vocative) ────────
  const greetLen = GREETING.exec(text)?.[0].length ?? 0
  const token = readHandleToken(text.slice(greetLen))
  if (token) {
    for (const cand of handleCandidates(token)) {
      if (isOwn(cand)) {
        return {
          mode: 'summon',
          targetHandle: cand,
          stripped: stripLeading(text, greetLen + cand.length),
        }
      }
      const other = otherVoyager(cand)
      if (other) {
        return {
          mode: 'summon',
          targetHandle: cand,
          targetOwnerName: other.ownerName,
          stripped: stripLeading(text, greetLen + cand.length),
        }
      }
    }
  }

  // Mid-sentence mentions, plain chatter, and unregistered leading words all
  // land here — NOT a summon.
  return { mode: 'plain', stripped: text }
}

// A voyager's default handle until its owner names it: `<username>.voyager`.
// One derivation, shared by the migration backfill and the runtime lookup so
// the default can never drift between the two.
export const deriveVoyagerHandle = (username: string): string =>
  `${username.trim().toLowerCase()}.voyager`

// The caller's own voyager handle from its raw parts: a claimed row wins, else
// the derived default, else ''. Pure and isomorphic — it lives HERE (not in the
// server-only handles data layer) so the client composer + optimistic settle
// resolve the OWN handle through the exact same rule the server does, and the
// classification can never drift between what you see and what happens.
export const pickOwnVoyagerHandle = (
  rowHandle: string | null | undefined,
  username: string | null | undefined,
): string => {
  if (rowHandle) return rowHandle.trim().toLowerCase()
  if (username) return deriveVoyagerHandle(username)
  return ''
}

// A voyager's CUSTOM name (for the prompt identity) vs its derived default.
// Provenance by VALUE: a claimed row whose handle differs from `<username>.voyager`
// is a real name — so `nova.voyager` named by user `alice` counts, which a
// `.endsWith('.voyager')` suffix test wrongly suppressed. '' / derived → null.
export const voyagerCustomName = (
  rowHandle: string | null | undefined,
  username: string | null | undefined,
): string | null => {
  const derived = username ? deriveVoyagerHandle(username) : null
  return rowHandle && rowHandle !== derived ? rowHandle : null
}

// The composer badge — the @-inversion mitigation (C5). Typing `@<own-handle>`
// surfaces "→ private aside to <Name>" at composition time, so the deliberately
// inverted convention (`@` = private whisper, not public mention) is visible
// BEFORE you send. Derived from the SAME resolver, so what you see can never
// drift from what the server does. Returns null when the text is not an
// own-aside (a mention of another's voyager shows NO private-aside badge).
export const composerAsideBadge = (raw: string, ctx: AddressContext): string | null => {
  if (resolveAddress(raw, ctx).mode !== 'aside') return null
  const token = readHandleToken(raw.trim().slice(1))
  const name = token ? token.charAt(0).toUpperCase() + token.slice(1) : 'your Voyager'
  return `→ private aside to ${name}`
}
