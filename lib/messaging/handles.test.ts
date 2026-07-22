import { describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  handles: { data: null as unknown, error: null as unknown },
  profiles: { data: null as unknown, error: null as unknown },
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      const result = table === 'handles' ? db.handles : db.profiles
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.maybeSingle = () => Promise.resolve(result)
      return builder
    },
  }),
}))

import { getOwnVoyagerIdentity, renameVoyagerHandle } from './handles'

describe('getOwnVoyagerIdentity — owner-only lookup fails closed', () => {
  it('does not invent a derived handle when the handles read errors', async () => {
    db.handles = { data: null, error: { message: 'connection reset' } }
    db.profiles = { data: { username: 'isaac' }, error: null }
    expect(await getOwnVoyagerIdentity('user-isaac')).toEqual({ handle: '', displayName: null })
  })

  it('derives a default only after a successful empty handles read', async () => {
    db.handles = { data: null, error: null }
    db.profiles = { data: { username: 'isaac' }, error: null }
    expect(await getOwnVoyagerIdentity('user-isaac')).toEqual({
      handle: 'isaac.voyager',
      displayName: null,
    })
  })

  it('returns a claimed custom name', async () => {
    db.handles = { data: { handle: 'wren' }, error: null }
    db.profiles = { data: { username: 'isaac' }, error: null }
    expect(await getOwnVoyagerIdentity('user-isaac')).toEqual({
      handle: 'wren',
      displayName: 'Wren',
    })
  })
})

describe('renameVoyagerHandle', () => {
  it('rejects reserved words and invalid patterns before writing', async () => {
    expect((await renameVoyagerHandle('user-1', 'voyager')).ok).toBe(false)
    expect((await renameVoyagerHandle('user-1', 'A!')).ok).toBe(false)
  })
})
