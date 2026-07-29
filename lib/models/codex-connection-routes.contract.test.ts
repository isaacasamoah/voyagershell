import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getActiveCodexConnection: vi.fn(),
  pollDeviceAuth: vi.fn(),
  readCodexMetadata: vi.fn(),
  requireAuthResponse: vi.fn(),
  startDeviceAuth: vi.fn(),
  upsertCodexConnection: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireAuthResponse: mocks.requireAuthResponse,
}))
vi.mock('@/lib/debug', () => ({
  log: { api: vi.fn() },
}))
vi.mock('@/lib/models', () => ({
  getActiveCodexConnection: mocks.getActiveCodexConnection,
  pollDeviceAuth: mocks.pollDeviceAuth,
  readCodexMetadata: mocks.readCodexMetadata,
  startDeviceAuth: mocks.startDeviceAuth,
  upsertCodexConnection: mocks.upsertCodexConnection,
}))

import * as statusRoute from '@/app/api/connections/codex/route'
import { POST as startDevice } from '@/app/api/connections/codex/device/route'
import { POST as pollDevice } from '@/app/api/connections/codex/device/poll/route'

const fakeTokens = {
  accessToken: 'unmistakably-fake-access',
  refreshToken: 'unmistakably-fake-refresh',
  idToken: 'unmistakably-fake-id',
}

describe('Codex connection route contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuthResponse.mockResolvedValue('fixture-user')
  })

  it('keeps the fixture device flow wired through server-side storage', async () => {
    mocks.startDeviceAuth.mockResolvedValue({
      deviceAuthId: 'fixture-device',
      userCode: 'FIXTURE',
      interval: 5,
      verificationUrl: 'https://example.invalid/device',
    })
    mocks.pollDeviceAuth.mockResolvedValue({
      status: 'complete',
      tokens: fakeTokens,
    })
    mocks.readCodexMetadata.mockReturnValue({ planType: 'fixture-plan' })

    const started = await startDevice()
    expect(await started.json()).toMatchObject({
      device_auth_id: 'fixture-device',
      user_code: 'FIXTURE',
    })

    const polled = await pollDevice(new Request('https://voyager.invalid/poll', {
      method: 'POST',
      body: JSON.stringify({
        device_auth_id: 'fixture-device',
        user_code: 'FIXTURE',
      }),
    }))
    expect(await polled.json()).toEqual({
      status: 'connected',
      plan_type: 'fixture-plan',
    })
    expect(mocks.upsertCodexConnection).toHaveBeenCalledWith({
      userId: 'fixture-user',
      ...fakeTokens,
    })
  })

  it('preserves the GET status route used by useBrainConnection', async () => {
    mocks.getActiveCodexConnection.mockResolvedValue({
      accessToken: 'unmistakably-fake-access',
      accountId: 'unmistakably-fake-account',
    })

    expect(statusRoute).not.toHaveProperty('POST')
    expect(await (await statusRoute.GET()).json()).toEqual({
      connected: true,
      provider: 'openai',
    })
    expect(readFileSync('components/ui/hooks/useBrainConnection.ts', 'utf8'))
      .toContain("fetch('/api/connections/codex')")
  })

  it('keeps the connect page on device start and poll routes', () => {
    const source = readFileSync('app/connect/page.tsx', 'utf8')
    expect(source).toContain("fetch('/api/connections/codex/device'")
    expect(source).toContain("fetch('/api/connections/codex/device/poll'")
  })
})
