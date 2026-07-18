import { describe, expect, it } from 'vitest'
import { renameVoyagerHandle, toRoomVoyagerHandles } from './handles'

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
