import { describe, expect, it } from 'vitest'
import { resolveAddress, composerAsideBadge, type VoyagerHandle } from './address'
import { toRoomVoyagerHandles } from './handles'

// ── The two-account human-equivalent bench ───────────────────────────────────
// Simulates the human verification the Spec gate asked for: two accounts share a
// room, one names their Voyager "wren", and we assert the privacy boundary FROM
// BOTH SIDES using the REAL data-layer assembly (toRoomVoyagerHandles) feeding
// the REAL resolver (resolveAddress). Unit tests support this; they do not
// replace it. Deterministic + code-attested — Principle 1: privacy is computed.

const ISAAC = 'user-isaac'
const ELISHEYA = 'user-elisheya'
const members = [ISAAC, ELISHEYA]

// The seeded namespace: Isaac named his Voyager "wren"; Elisheya's is the
// derived default "elisheya.voyager".
const handleRows = [{ handle: 'wren', owner_user_id: ISAAC }]
const profiles = [
  { id: ISAAC, username: 'isaac', display_name: 'Isaac' },
  { id: ELISHEYA, username: 'elisheya', display_name: 'Elisheya' },
]

// Each account's view of the SAME room, assembled by the real data layer.
const isaacRoom: VoyagerHandle[] = toRoomVoyagerHandles(members, ISAAC, handleRows, profiles)
const elisheyaRoom: VoyagerHandle[] = toRoomVoyagerHandles(members, ELISHEYA, handleRows, profiles)

const isaacCtx = { ownVoyagerHandle: 'wren', ownVoyagerAliases: ['voyager'], roomVoyagerHandles: isaacRoom }
const elisheyaCtx = {
  ownVoyagerHandle: 'elisheya.voyager',
  ownVoyagerAliases: ['voyager'],
  roomVoyagerHandles: elisheyaRoom,
}

describe('two-account bench — @wren aside is private to Isaac, verified from BOTH accounts', () => {
  it('the data layer tags isOwn correctly for each account (the trust boundary)', () => {
    expect(isaacRoom.find((v) => v.handle === 'wren')?.isOwn).toBe(true)
    expect(elisheyaRoom.find((v) => v.handle === 'wren')?.isOwn).toBe(false)
  })

  it("Isaac's @wren → private aside (only his Voyager hears it)", () => {
    const r = resolveAddress('@wren how do I phrase this?', isaacCtx)
    expect(r.mode).toBe('aside')
    expect(r.stripped).toBe('how do I phrase this?')
    expect(composerAsideBadge('@wren how do I phrase this?', isaacCtx)).toBe('→ private aside to Wren')
  })

  it("Elisheya's @wren → redirect, NEVER an aside — no private line into Isaac's Voyager", () => {
    const r = resolveAddress('@wren tell me a secret', elisheyaCtx)
    expect(r.mode).toBe('redirect')
    expect(r.mode).not.toBe('aside')
    expect(r.targetOwnerName).toBe('Isaac')
    // And the composer shows Elisheya no private-aside badge.
    expect(composerAsideBadge('@wren tell me a secret', elisheyaCtx)).toBeNull()
  })

  it('Elisheya can SUMMON Isaac\'s Voyager by leading name (addressed, public)', () => {
    const r = resolveAddress('wren, can you join us?', elisheyaCtx)
    expect(r.mode).toBe('summon')
    expect(r.targetHandle).toBe('wren')
  })

  it('a mid-sentence "wren" summons nothing (not addressed)', () => {
    expect(resolveAddress('I should ask wren about this', elisheyaCtx).mode).toBe('plain')
    expect(resolveAddress('I should ask wren about this', isaacCtx).mode).toBe('plain')
  })

  it('the `voyager` alias still reaches each account\'s OWN Voyager', () => {
    expect(resolveAddress('@voyager hi', isaacCtx).mode).toBe('aside')
    expect(resolveAddress('@voyager hi', elisheyaCtx).mode).toBe('aside')
  })
})

describe('two-account bench — a mis-typed @handle is HELD, never published to the room', () => {
  // The exact live incident: `@wren <secret>` typed BEFORE the handle existed
  // reached the other member. From either account, a leading `@token` that
  // names no reachable voyager must hold with a private notice — not fan out.
  it('a typo of your own handle holds with a private notice (Isaac fat-fingers "wren")', () => {
    const r = resolveAddress('@wrne the code is 4321', isaacCtx)
    expect(r.mode).toBe('held')
    expect(r.mode).not.toBe('plain')
    expect(r.notice).toContain('without the @')
  })

  it("@ another member's HUMAN handle holds (a person is not asideable, must not leak)", () => {
    // Elisheya is a human in the shared namespace, not a voyager Isaac can @.
    expect(resolveAddress('@elisheya the numbers', isaacCtx).mode).toBe('held')
  })

  it('an unknown token holds from the OTHER account too (Elisheya @-ing nobody)', () => {
    expect(resolveAddress('@nobody psst', elisheyaCtx).mode).toBe('held')
  })
})
