import { describe, expect, it } from 'vitest'
import { deriveVoyagerHandle, resolveAddress, type AddressContext } from './address'

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

  it('@human handle → plain, never aside (humans are not asideable)', () => {
    // elisheya is a human handle in the shared namespace, not a voyager
    const r = resolveAddress('@elisheya hi', isaac)
    expect(r.mode).toBe('plain')
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
    expect(resolveAddress('wrench, pass it here', isaac).mode).toBe('plain')
    expect(resolveAddress('@wrenette hush', isaac).mode).toBe('plain')
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
