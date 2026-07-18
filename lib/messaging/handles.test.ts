import { describe, expect, it, vi } from 'vitest'

// Mutable per-test results for the mocked admin client, one slot per table.
const db = vi.hoisted(() => ({
  handles: { data: null as unknown, error: null as unknown },
  profiles: { data: null as unknown, error: null as unknown },
}))

// A minimal chainable Supabase builder — every filter returns itself; the
// terminal maybeSingle() resolves the table's configured { data, error }.
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      const result = table === 'handles' ? db.handles : db.profiles
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = () => b
      b.in = () => b
      b.maybeSingle = () => Promise.resolve(result)
      return b
    },
  }),
}))

import { getOwnVoyagerIdentity, renameVoyagerHandle, toRoomVoyagerHandles } from './handles'

describe('toRoomVoyagerHandles — isOwn is true ONLY for the caller', () => {
  const caller = 'user-isaac'
  const other = 'user-elisheya'
  const members = [caller, other]

  it('tags each member voyager with isOwn correct for the caller', () => {
    const result = toRoomVoyagerHandles(
      members,
      caller,
      [
        { handle: 'wren', owner_user_id: caller },
        { handle: 'elisheya.voyager', owner_user_id: other },
      ],
      [
        { id: caller, username: 'isaac', display_name: 'Isaac' },
        { id: other, username: 'elisheya', display_name: 'Elisheya' },
      ],
    )
    expect(result).toEqual([
      { handle: 'wren', ownerName: 'Isaac', isOwn: true },
      { handle: 'elisheya.voyager', ownerName: 'Elisheya', isOwn: false },
    ])
  })

  it('derives the default handle for a member with no claimed row', () => {
    const result = toRoomVoyagerHandles(
      members,
      caller,
      [{ handle: 'wren', owner_user_id: caller }],
      [
        { id: caller, username: 'isaac', display_name: 'Isaac' },
        { id: other, username: 'elisheya', display_name: 'Elisheya' },
      ],
    )
    expect(result.find((v) => !v.isOwn)?.handle).toBe('elisheya.voyager')
  })

  it('skips members with neither a handle nor a username', () => {
    const result = toRoomVoyagerHandles(
      members,
      caller,
      [{ handle: 'wren', owner_user_id: caller }],
      [
        { id: caller, username: 'isaac', display_name: 'Isaac' },
        { id: other, username: null, display_name: 'Elisheya' },
      ],
    )
    expect(result).toHaveLength(1)
    expect(result[0].isOwn).toBe(true)
  })

  it('falls back to username then "someone" for the redirect ownerName', () => {
    const result = toRoomVoyagerHandles(
      [other],
      caller,
      [],
      [{ id: other, username: 'elisheya', display_name: null }],
    )
    expect(result[0].ownerName).toBe('elisheya')
  })
})

// The security-critical discrimination (C1): a handles-read ERROR must fail
// CLOSED — never invent a derived handle from an errored read, because that
// would silently reclassify an aside. A null row with NO error is a genuinely
// unnamed voyager, which legitimately derives its default.
describe('getOwnVoyagerIdentity — fails CLOSED on a read error', () => {
  it('errored handles read → handle "" (does NOT invent the derived default)', async () => {
    db.handles = { data: null, error: { message: 'connection reset' } }
    db.profiles = { data: { username: 'isaac' }, error: null }
    const id = await getOwnVoyagerIdentity('user-isaac')
    // Even though the username would derive `isaac.voyager`, the errored read
    // must NOT produce it — an aside can only ever match a real own handle.
    expect(id.handle).toBe('')
    expect(id.name).toBeNull()
  })

  it('null row with NO error → derives <username>.voyager (genuinely unnamed)', async () => {
    db.handles = { data: null, error: null }
    db.profiles = { data: { username: 'isaac' }, error: null }
    const id = await getOwnVoyagerIdentity('user-isaac')
    expect(id.handle).toBe('isaac.voyager')
    expect(id.name).toBeNull()
  })

  it('a claimed custom name → handle + name both surface', async () => {
    db.handles = { data: { handle: 'wren' }, error: null }
    db.profiles = { data: { username: 'isaac' }, error: null }
    const id = await getOwnVoyagerIdentity('user-isaac')
    expect(id.handle).toBe('wren')
    expect(id.name).toBe('wren')
  })
})

// The naming ritual rides set_username-style validation. Reserved words and
// pattern violations are rejected BEFORE any namespace write — no DB needed.
describe('renameVoyagerHandle — validation gate (no DB)', () => {
  it('rejects a reserved word', async () => {
    const result = await renameVoyagerHandle('user-1', 'voyager')
    expect(result.ok).toBe(false)
  })

  it('rejects a pattern violation', async () => {
    const result = await renameVoyagerHandle('user-1', 'A!')
    expect(result.ok).toBe(false)
  })
})
