import { describe, expect, it } from 'vitest'
import { pickOwnVoyagerHandle, toRoomVoyagerHandles } from './handles'

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
