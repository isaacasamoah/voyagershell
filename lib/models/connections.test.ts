import { beforeEach, describe, expect, it, vi } from 'vitest'

const updates: Record<string, unknown>[] = []
const refreshCodexToken = vi.fn()
const jwt = (account: string): string => [
  'fixture',
  Buffer.from(JSON.stringify({
    'https://api.openai.com/auth': { chatgpt_account_id: account },
  })).toString('base64url'),
  'signature',
].join('.')
let payload = {
  access_token: jwt('unmistakably-fake-account-live'),
  refresh_token: 'unmistakably-fake-refresh',
}
const row = {
  id: 'fixture-connection',
  user_id: 'fixture-user',
  kind: 'subscription_oauth',
  provider: 'openai',
  encrypted_payload: 'fixture-payload',
  iv: 'fixture-iv',
  auth_tag: 'fixture-tag',
  account_id: 'unmistakably-fake-account-stored',
  plan_type: 'fixture-plan',
  token_expires_at: '2099-01-01T00:00:00.000Z',
  status: 'active',
  last_refresh_at: new Date().toISOString(),
  updated_at: '2026-01-01T00:00:00.000Z',
}

const builder = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  then: (resolve: (value: unknown) => void) => resolve({
    data: [{ id: row.id }],
    error: null,
  }),
}
builder.select.mockReturnValue(builder)
builder.eq.mockReturnValue(builder)
builder.maybeSingle.mockResolvedValue({ data: row, error: null })
builder.update.mockImplementation((value) => {
  updates.push(value)
  return builder
})

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ from: () => builder }),
}))
vi.mock('./encryption', () => ({
  open: () => JSON.stringify(payload),
  seal: () => ({ ciphertext: 'fixture-sealed', iv: 'fixture-iv', authTag: 'fixture-tag' }),
}))
vi.mock('./codex-device-auth', () => ({ refreshCodexToken }))

describe('Codex connection identity', () => {
  beforeEach(() => {
    updates.splice(0)
    refreshCodexToken.mockReset()
    row.account_id = 'unmistakably-fake-account-stored'
    row.last_refresh_at = new Date().toISOString()
    payload = {
      access_token: jwt('unmistakably-fake-account-live'),
      refresh_token: 'unmistakably-fake-refresh',
    }
  })

  it('returns null and marks needs_attention on account mismatch', async () => {
    const { getActiveCodexConnection } = await import('./connections')
    await expect(getActiveCodexConnection('fixture-user')).resolves.toBeNull()
    expect(updates).toContainEqual({ status: 'needs_attention' })
  })

  it('refreshes stale credentials even when exp remains far in the future', async () => {
    row.account_id = 'unmistakably-fake-account-current'
    row.last_refresh_at = '2020-01-01T00:00:00.000Z'
    payload = {
      access_token: jwt('unmistakably-fake-account-current'),
      refresh_token: 'unmistakably-fake-refresh',
    }
    refreshCodexToken.mockResolvedValue({
      accessToken: jwt('unmistakably-fake-account-current'),
      refreshToken: 'unmistakably-fake-refresh-next',
    })

    const { getActiveCodexConnection } = await import('./connections')
    await expect(getActiveCodexConnection('fixture-user')).resolves.toEqual({
      accessToken: jwt('unmistakably-fake-account-current'),
      accountId: 'unmistakably-fake-account-current',
    })
    expect(refreshCodexToken).toHaveBeenCalledOnce()
  })
})
