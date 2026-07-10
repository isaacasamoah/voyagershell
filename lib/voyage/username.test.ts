import { describe, expect, it } from 'vitest'
import { resolveMemberByName } from './index'
import { normalizeUsername } from './username'

describe('resolveMemberByName username addressing', () => {
  it('prefers an exact username over a display name containing the same name', () => {
    const members = [
      { userId: 'display-match', displayName: 'Isaac Newton', username: 'newton' },
      { userId: 'username-match', displayName: 'Elisheya', username: 'isaac' },
    ]

    expect(resolveMemberByName(members, 'isaac')).toEqual({
      userId: 'username-match',
      displayName: 'Elisheya',
    })
  })

  it('matches usernames case-insensitively', () => {
    const members = [{ userId: 'isaac-id', displayName: 'Isaac', username: 'isaac' }]

    expect(resolveMemberByName(members, 'ISAAC')).toEqual({
      userId: 'isaac-id',
      displayName: 'Isaac',
    })
  })

  it('falls back to existing display name matching when no username matches', () => {
    const members = [{ userId: 'vanessa-id', displayName: 'Vanessa Bell', username: 'vbell' }]

    expect(resolveMemberByName(members, 'vanessa')).toEqual({
      userId: 'vanessa-id',
      displayName: 'Vanessa Bell',
    })
  })

  it('uses a unique username even when display name matching is ambiguous', () => {
    const members = [
      { userId: 'first-isaac', displayName: 'Isaac Newton', username: 'newton' },
      { userId: 'second-isaac', displayName: 'Isaac Asimov', username: 'isaac' },
    ]

    expect(resolveMemberByName(members, 'isaac')).toEqual({
      userId: 'second-isaac',
      displayName: 'Isaac Asimov',
    })
  })
})

describe('normalizeUsername', () => {
  it.each(['isaac', 'elisheya', 'is.aac'])('accepts %s', (raw) => {
    expect(normalizeUsername(raw)).toEqual({ ok: true, username: raw })
  })

  it('normalizes whitespace and casing', () => {
    expect(normalizeUsername('  Is.Aac  ')).toEqual({ ok: true, username: 'is.aac' })
  })

  it.each(['Voyager', 'a', 'has spaces', '😀'])('rejects %s', (raw) => {
    expect(normalizeUsername(raw).ok).toBe(false)
  })
})
