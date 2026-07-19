import { describe, expect, it } from 'vitest'
import {
  composerAsideBadge,
  deriveVoyagerHandle,
  pickOwnVoyagerHandle,
  resolveAddress,
  voyagerCustomName,
  type AddressContext,
} from './address'

// Isaac owns Wren; Elisheya is in the room and owns Hermes.
const isaac: AddressContext = {
  ownVoyagerHandle: 'wren',
  ownVoyagerAliases: ['voyager'],
  roomVoyagerHandles: [
    { handle: 'wren', ownerName: 'Isaac', isOwn: true },
    { handle: 'hermes', ownerName: 'Elisheya', isOwn: false },
  ],
}
// Elisheya's view of the SAME room — Wren is now someone else's.
const elisheya: AddressContext = {
  ownVoyagerHandle: 'hermes',
  ownVoyagerAliases: ['voyager'],
  roomVoyagerHandles: [
    { handle: 'wren', ownerName: 'Isaac', isOwn: false },
    { handle: 'hermes', ownerName: 'Elisheya', isOwn: true },
  ],
}

describe('resolveAddress — C1: the aside is own-voyager-only (the trust boundary)', () => {
  it('@own → aside, prefix stripped', () => {
    const r = resolveAddress('@wren how do I say this gently?', isaac)
    expect(r.mode).toBe('aside')
    expect(r.stripped).toBe('how do I say this gently?')
  })

  it("@other-person's-voyager → redirect, NEVER aside (no private channel opens)", () => {
    const r = resolveAddress('@wren what do you think?', elisheya)
    expect(r.mode).toBe('redirect')
    expect(r.mode).not.toBe('aside')
    expect(r.targetOwnerName).toBe('Isaac')
    // text kept intact so it can fall through to public address
    expect(r.stripped).toBe('@wren what do you think?')
  })

  it('@human handle → held, never aside AND never a published plain', () => {
    // elisheya is a human handle in the shared namespace, not a voyager. It
    // names no reachable voyager, so it must be held (not fanned out), never
    // aside — humans are not asideable, and the words must not leak to the room.
    const r = resolveAddress('@elisheya hi', isaac)
    expect(r.mode).toBe('held')
    expect(r.mode).not.toBe('aside')
    expect(r.mode).not.toBe('plain')
  })

  it('bare @own with no message → aside with empty body (caller no-ops)', () => {
    const r = resolveAddress('@wren', isaac)
    expect(r.mode).toBe('aside')
    expect(r.stripped).toBe('')
  })
})

describe('resolveAddress — summon (leading name, vocative)', () => {
  it('leading own-handle + comma → summon own', () => {
    const r = resolveAddress('wren, what do you think?', isaac)
    expect(r.mode).toBe('summon')
    expect(r.targetHandle).toBe('wren')
    expect(r.stripped).toBe('what do you think?')
  })

  it('greeting prefix before handle still summons ("hey wren, …")', () => {
    expect(resolveAddress('hey wren, you there?', isaac).mode).toBe('summon')
  })

  it("leading another member's voyager → summon (target carries owner)", () => {
    const r = resolveAddress('wren, summarize what we decided', elisheya)
    expect(r.mode).toBe('summon')
    expect(r.targetHandle).toBe('wren')
    expect(r.targetOwnerName).toBe('Isaac')
  })

  it('mid-sentence mention is NOT a summon', () => {
    expect(resolveAddress('I bet wren knows the answer', isaac).mode).toBe('plain')
    expect(resolveAddress('ask wren, please', isaac).mode).toBe('plain')
  })

  it('plain chatter → plain', () => {
    expect(resolveAddress('good morning everyone', isaac).mode).toBe('plain')
  })
})

describe('resolveAddress — footguns (substring / common-word / case / unicode)', () => {
  it('substring: "wrench," does NOT summon "wren"', () => {
    // Leading-name (no `@`) that matches nothing is ordinary chatter — plain.
    expect(resolveAddress('wrench, pass it here', isaac).mode).toBe('plain')
    // But a leading `@`-substring names no reachable voyager → held, never aside.
    expect(resolveAddress('@wrenette hush', isaac).mode).toBe('held')
  })

  it('leading common English word that is NOT a registered handle stays inert', () => {
    // no `will` voyager in the room
    expect(resolveAddress('Will, you attend?', isaac).mode).toBe('plain')
  })

  it('case-insensitive: "Wren," and "@Wren" resolve like lowercase', () => {
    expect(resolveAddress('Wren, hello', isaac).mode).toBe('summon')
    expect(resolveAddress('@Wren hello', isaac).mode).toBe('aside')
  })

  it('homoglyph / non-ASCII leading token fails SAFE (no summon, no leak)', () => {
    // Cyrillic 'wren' look-alike is not the ASCII handle → never routes
    expect(resolveAddress('еren, hi', isaac).mode).toBe('plain')
  })

  it('dotted derived handle (isaac.voyager) is matched whole', () => {
    const ctx: AddressContext = { ownVoyagerHandle: 'isaac.voyager', ownVoyagerAliases: ['voyager'] }
    expect(resolveAddress('@isaac.voyager draft this', ctx).mode).toBe('aside')
    expect(resolveAddress('isaac.voyager, draft this', ctx).mode).toBe('summon')
  })
})

describe('resolveAddress — trailing punctuation glued to the handle stays PRIVATE', () => {
  // The confidentiality edge: `@wren.actually secret` greedily tokenises to
  // `wren.actually`, which is no handle. It must NOT downgrade to a published
  // `plain` (the aside would fan out to the room) — the separator-boundary
  // prefix `wren` is the own handle, so it stays an aside.
  it('@own with a glued trailing dot → aside (not a published plain)', () => {
    const r = resolveAddress('@wren.actually keep this between us', isaac)
    expect(r.mode).toBe('aside')
    expect(r.mode).not.toBe('plain')
    expect(r.stripped).toBe('actually keep this between us')
  })

  it('@own with a glued trailing hyphen / ellipsis-dots → aside', () => {
    expect(resolveAddress('@wren-hmm one sec', isaac).mode).toBe('aside')
    expect(resolveAddress('@wren... thinking', isaac).mode).toBe('aside')
  })

  it('the composer still shows a private-aside badge for the glued form', () => {
    // The confidentiality guarantee is that it badges as a private aside at all
    // (the badge reflects the typed token by design — C5).
    expect(composerAsideBadge('@wren.actually psst', isaac)).not.toBeNull()
  })

  it('leading own-handle with glued punctuation still summons', () => {
    expect(resolveAddress('wren. what next?', isaac).mode).toBe('summon')
  })

  it("@another's-voyager with glued punctuation still REDIRECTS, never aside", () => {
    // Elisheya @-ing Isaac's Wren with trailing punctuation must not become an
    // aside for her — C1 holds for every separator-boundary candidate.
    const r = resolveAddress('@wren.please advise', elisheya)
    expect(r.mode).toBe('redirect')
    expect(r.mode).not.toBe('aside')
  })

  it('substring guard survives: "@wrench" (no separator) never opens a wren aside', () => {
    // The substring guard holds: `@wrench` must not become Wren's aside. It is
    // held (no reachable voyager), never a published plain, never an aside.
    const r = resolveAddress('@wrench pass it', isaac)
    expect(r.mode).not.toBe('aside')
    expect(r.mode).toBe('held')
  })
})

describe('resolveAddress — held: a leading @token that names no voyager NEVER fans out (Test Gate rework)', () => {
  // The confidentiality regression the Test Gate caught: `@wren <secret>` typed
  // BEFORE the handle `wren` existed fell through as a published `plain` and
  // reached the other member. A leading `@token` that is neither (a) the
  // sender's own voyager (aside) nor (b) another member's voyager (redirect)
  // must be HELD — server returns a private notice, the words never fan out.
  it('@unknown-token → held with a private notice (never plain, never fanned out)', () => {
    const r = resolveAddress('@nobody the code is 4321', isaac)
    expect(r.mode).toBe('held')
    expect(r.mode).not.toBe('plain')
    expect(r.notice).toContain('without the @')
    expect(r.notice).toContain('nobody')
  })

  it('@typo-of-own-voyager → held, not an accidental publish', () => {
    // Isaac owns "wren"; a fat-fingered "@wrne" resolves to nothing.
    const r = resolveAddress('@wrne keep this between us', isaac)
    expect(r.mode).toBe('held')
    expect(r.mode).not.toBe('plain')
  })

  it('@human-handle → held (a person is not a voyager, and must not leak)', () => {
    expect(resolveAddress('@elisheya the numbers', isaac).mode).toBe('held')
  })

  it('a homoglyph of your own @handle fails SAFE — held, never aside, never plain', () => {
    // Cyrillic look-alike of "wren" is not the ASCII handle → no aside opens…
    const r = resolveAddress('@wrеn secret', isaac) // the "е" is Cyrillic U+0435
    expect(r.mode).not.toBe('aside')
    expect(r.mode).toBe('held') // …and it does not fan out either
  })

  it('the SUMMON path (leading name, no @) that matches nothing stays plain, NOT held', () => {
    // Only the `@` path holds. An ordinary sentence that happens to start with a
    // capitalised word must never be withheld from the room.
    expect(resolveAddress('Will, you attend?', isaac).mode).toBe('plain')
    expect(resolveAddress('Nobody knows the answer', isaac).mode).toBe('plain')
  })

  it('a bare leading "@" with no token is not an address attempt → plain', () => {
    expect(resolveAddress('@ hi everyone', isaac).mode).toBe('plain')
  })
})

describe('resolveAddress — C3: legacy `voyager` survives only as an alias for your own', () => {
  it('@voyager → aside to own (same result as @wren for the owner)', () => {
    const viaAlias = resolveAddress('@voyager help', isaac)
    const viaName = resolveAddress('@wren help', isaac)
    expect(viaAlias.mode).toBe('aside')
    expect(viaAlias).toEqual(viaName)
  })

  it('leading `voyager` → summon own (generalized regex parity)', () => {
    expect(resolveAddress('voyager, what next?', isaac).mode).toBe('summon')
    expect(resolveAddress('hey voyager', isaac).mode).toBe('summon')
  })

  it('alias works even before the user has claimed a handle (empty own handle)', () => {
    const unnamed: AddressContext = { ownVoyagerHandle: '', ownVoyagerAliases: ['voyager'] }
    expect(resolveAddress('@voyager hi', unnamed).mode).toBe('aside')
    // empty own handle must NOT make an empty @ match anything
    expect(resolveAddress('@ hi', unnamed).mode).toBe('plain')
  })
})

describe('deriveVoyagerHandle — C2: default handle derivation', () => {
  it('derives `<username>.voyager`, lowercased', () => {
    expect(deriveVoyagerHandle('isaac')).toBe('isaac.voyager')
    expect(deriveVoyagerHandle('Elisheya')).toBe('elisheya.voyager')
  })
})

describe('composerAsideBadge — C5: the @-inversion mitigation', () => {
  it('typing @own → "→ private aside to <Name>"', () => {
    expect(composerAsideBadge('@wren how do I', isaac)).toBe('→ private aside to Wren')
  })

  it('the @voyager alias badges too, capitalised', () => {
    expect(composerAsideBadge('@voyager think with me', isaac)).toBe('→ private aside to Voyager')
  })

  it("typing @another-person's-voyager → NO private-aside badge (redirect, not aside)", () => {
    expect(composerAsideBadge('@hermes hi', isaac)).toBeNull()
  })

  it('plain text and mid-sentence mentions → no badge', () => {
    expect(composerAsideBadge('ask wren later', isaac)).toBeNull()
    expect(composerAsideBadge('wren, summon', isaac)).toBeNull()
  })
})

describe('pickOwnVoyagerHandle — a claimed row wins, else the derived default', () => {
  it('returns a claimed voyager name over the derived default', () => {
    expect(pickOwnVoyagerHandle('wren', 'isaac')).toBe('wren')
  })

  it('falls back to <username>.voyager when the voyager is unnamed', () => {
    expect(pickOwnVoyagerHandle(null, 'isaac')).toBe('isaac.voyager')
  })

  it('lowercases a claimed handle so it can never drift from the index', () => {
    expect(pickOwnVoyagerHandle('Wren', 'isaac')).toBe('wren')
  })

  it('returns empty when the user has no username yet', () => {
    expect(pickOwnVoyagerHandle(null, null)).toBe('')
  })
})

describe('voyagerCustomName — provenance by value, not by suffix', () => {
  it('recognises an ordinary custom name', () => {
    expect(voyagerCustomName('wren', 'isaac')).toBe('wren')
  })

  it('treats the derived default as NOT a custom name', () => {
    expect(voyagerCustomName('isaac.voyager', 'isaac')).toBeNull()
  })

  // The bug the `.endsWith('.voyager')` heuristic caused: a legally-claimed name
  // that happens to end in `.voyager` was suppressed from the prompt identity.
  it('recognises a custom name that ends in .voyager (the suffix-heuristic bug)', () => {
    expect(voyagerCustomName('nova.voyager', 'alice')).toBe('nova.voyager')
  })

  it('is null for an unnamed voyager (no row)', () => {
    expect(voyagerCustomName(null, 'isaac')).toBeNull()
  })
})

describe('resolveAddress — cut ④: a cross-owner summon carries the OWNER identity', () => {
  // Elisheya's view of the room: Wren is Isaac's, Hermes is hers. The handle set
  // now carries owner_user_id + the voyager's name (the data-layer threading).
  const elisheyaWithOwners: AddressContext = {
    ownVoyagerHandle: 'hermes',
    ownVoyagerAliases: ['voyager'],
    roomVoyagerHandles: [
      { handle: 'wren', ownerName: 'Isaac', isOwn: false, ownerUserId: 'user-isaac', name: 'Wren' },
      { handle: 'hermes', ownerName: 'Elisheya', isOwn: true, ownerUserId: 'user-elisheya', name: 'Hermes' },
    ],
  }

  it('summoning another member’s voyager carries targetOwnerUserId + name', () => {
    const r = resolveAddress('wren, what do you make of that?', elisheyaWithOwners)
    expect(r.mode).toBe('summon')
    expect(r.targetOwnerUserId).toBe('user-isaac') // the identity of record (§6.5)
    expect(r.targetVoyagerName).toBe('Wren')
  })

  it('@another’s voyager redirect also carries the owner id (never a private channel)', () => {
    const r = resolveAddress('@wren advise', elisheyaWithOwners)
    expect(r.mode).toBe('redirect')
    expect(r.targetOwnerUserId).toBe('user-isaac')
  })

  it('a SELF-summon leaves targetOwnerUserId undefined (owner = summoner)', () => {
    const r = resolveAddress('hermes, help', elisheyaWithOwners)
    expect(r.mode).toBe('summon')
    expect(r.targetOwnerUserId).toBeUndefined() // run-turn defaults owner to the summoner
  })
})
