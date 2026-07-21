// The addressing grammar — the ONE code-attested resolver for how an utterance
// addresses a Voyager. This is the trust boundary from Principle 1: an `@`-aside
// can ONLY ever reach the speaker's OWN voyager, and that fact is COMPUTED here,
// never model-guessed (the rule the invite bug violated).
//
// Pure + isomorphic: no DB, no server imports. The client (composer badge) and
// the server (reply gate) both resolve through this same function, so the
// privacy classification can never drift between what you see and what happens.
//
// `voyager` survives as an alias for your own Voyager. There is deliberately no
// public or cross-owner invocation mode: naming a Voyager without `@` is room
// text, while any `@` token other than your own handle is held before send.

export type AddressMode = 'aside' | 'held' | 'plain'

export interface AddressContext {
  // The speaker's own voyager handle (claimed name or derived `<username>.voyager`).
  // Empty string when the user has no username yet — the `voyager` alias still carries it.
  ownVoyagerHandle: string
  ownVoyagerAliases?: string[] // aliases for your own voyager, e.g. ['voyager']
}

export interface AddressResult {
  mode: AddressMode
  notice?: string  // held: the private line the sender alone sees
  stripped: string // message with the leading own-address token removed
}

// Greedy handle-token read: consumes the WHOLE leading run of handle chars, so
// `wrench` never matches `wren` — the substring footgun dies at tokenization,
// not at a fragile per-handle regex. Returns the lowercased token, or null.
const HANDLE_TOKEN = /^[a-z0-9_.-]+/i
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

// The private line the sender — and ONLY the sender — sees when a leading
// `@token` names no reachable voyager. It is what makes the hold non-silent:
// the message stops here, but the user is told why and how to actually send it
// (drop the `@` and the same words go to the room).
const heldNotice = (token: string): string =>
  `Only your Voyager can be invoked here. Remove @ from "${token}" to send it as ordinary room text.`

export const resolveAddress = (raw: string, ctx: AddressContext): AddressResult => {
  const text = raw.trim()

  const ownSet = new Set(
    [ctx.ownVoyagerHandle, ...(ctx.ownVoyagerAliases ?? [])]
      .map(normalize)
      .filter((h) => h.length > 0),
  )
  const isOwn = (handle: string): boolean => ownSet.has(handle)

  // ── `@handle …` — the private-aside path ──────────────────────────────────
  if (text.startsWith('@')) {
    const token = readHandleToken(text.slice(1))
    if (!token) return { mode: 'plain', stripped: text }

    // Longest own-handle match first. A separator-terminated suffix remains
    // private (`@wren.actually`), while a substring (`@wrench`) cannot match.
    for (const cand of handleCandidates(token)) {
      if (isOwn(cand)) {
        // Aside to your own voyager — the whisper. Only you ever see it. The
        // aside carries no targetHandle: it ALWAYS routes to the speaker's own
        // voyager, so `@voyager` and `@wren` stay identical results (C3).
        return { mode: 'aside', stripped: stripLeading(text, 1 + cand.length) }
      }
    }
    // A different Voyager, a human handle, a typo, and an unknown token are all
    // indistinguishable here. HOLD every non-own `@` attempt before persistence
    // so it cannot become either a cross-owner invocation or an accidental room
    // disclosure. This also avoids using the room namespace as a discovery side
    // channel.
    const rawToken = text.slice(1, 1 + token.length)
    return { mode: 'held', notice: heldNotice(rawToken), stripped: text }
  }

  // Names are identity, not an execution grammar. Leading names, mid-sentence
  // mentions, and ordinary chatter all remain ordinary human text.
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

// Title-case a voyager handle for display, e.g. `wren` → `Wren`. One rule, so
// the composer badge, the prompt identity, and the WREN ✦ attribution all show
// the same shape from the same lowercase-normalized handle.
export const capitalizeName = (handle: string): string =>
  handle ? handle.charAt(0).toUpperCase() + handle.slice(1) : handle

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

export interface ComposerAudience {
  kind: 'private' | 'room' | 'held'
  label: string
}

// The always-visible audience contract. This is intentionally narrow rather
// than a generalized permission framework: the composer has exactly two valid
// destinations in this slice — the owner's private Voyager or the current room.
// The held state is not a destination; it tells the user the text will not send.
export const resolveComposerAudience = (
  raw: string,
  ctx: AddressContext,
  roomPeople: string[],
): ComposerAudience => {
  const address = resolveAddress(raw, ctx)
  if (address.mode === 'held') {
    return { kind: 'held', label: 'Not sent · only your Voyager can be invoked' }
  }
  if (address.mode === 'aside' || roomPeople.length === 0) {
    return { kind: 'private', label: 'Only you + your Voyager' }
  }
  return {
    kind: 'room',
    label: `This room · you + ${roomPeople.join(', ')}`,
  }
}
