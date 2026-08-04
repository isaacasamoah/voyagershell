import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  generateLink: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    auth: { admin: { generateLink: mocks.generateLink } },
  }),
}))
vi.mock('@/lib/auth', () => ({
  getBaseUrl: () => 'https://preview.voyager.test',
}))
vi.mock('@/emails/magic-link', () => ({
  magicLinkHtml: (url: string) => `<a href="${url}">Sign in</a>`,
  magicLinkText: (url: string) => `Sign in: ${url}`,
}))
vi.mock('resend', () => ({
  Resend: class {
    readonly emails = { send: mocks.sendEmail }
  },
}))

import { POST } from './route'

const request = (email: string) => new NextRequest(
  'https://preview.voyager.test/api/auth/magic-link',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  },
)

describe('magic-link delivery outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'hashed-preview-token' } },
      error: null,
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('reports transport unavailable without exposing the preview token', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('RESEND_API_KEY', '')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    const response = await POST(request('preview-no-mail@example.com'))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toEqual({
      success: false,
      outcome: 'transport_unavailable',
    })
    expect(JSON.stringify(body)).not.toContain('hashed-preview-token')
    expect(log).toHaveBeenCalledWith(
      '[Auth] Magic link (non-production):',
      'https://preview.voyager.test/auth/callback?token_hash=hashed-preview-token&type=magiclink',
    )
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('reports success only after the email transport sends', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('RESEND_API_KEY', 'test-resend-key')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    mocks.sendEmail.mockResolvedValue({ data: { id: 'email-1' }, error: null })

    const response = await POST(request('delivered@example.com'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ success: true, outcome: 'sent' })
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'delivered@example.com',
    }))
    expect(log).not.toHaveBeenCalledWith(
      '[Auth] Magic link (non-production):',
      expect.any(String),
    )
  })
})
