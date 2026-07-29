import {
  CODEX_OAUTH_CLIENT_ID,
  CODEX_TOKEN_ENDPOINT,
} from './codex'

const DEVICE_AUTH_BASE = 'https://auth.openai.com/api/accounts/deviceauth'
export const DEVICE_VERIFICATION_URL = 'https://auth.openai.com/codex/device'

export interface DeviceAuthStart {
  deviceAuthId: string
  userCode: string
  interval: number
  verificationUrl: string
}

export interface RefreshedTokens {
  accessToken: string
  refreshToken: string
  idToken?: string
  expiresInSec?: number
}

export type DevicePollResult =
  | { status: 'pending' }
  | { status: 'complete'; tokens: RefreshedTokens }

export const startDeviceAuth = async (): Promise<DeviceAuthStart> => {
  const res = await fetch(`${DEVICE_AUTH_BASE}/usercode`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: CODEX_OAUTH_CLIENT_ID }),
  })
  if (!res.ok) throw new Error(`Device auth start failed: HTTP ${res.status}`)
  const json = (await res.json()) as {
    device_auth_id: string
    user_code?: string
    usercode?: string
    interval?: number | string
  }
  const userCode = json.user_code ?? json.usercode
  if (!json.device_auth_id || !userCode) {
    throw new Error('Device auth start returned an unexpected shape')
  }
  const parsed = typeof json.interval === 'string'
    ? parseInt(json.interval, 10)
    : (json.interval ?? 5)
  return {
    deviceAuthId: json.device_auth_id,
    userCode,
    interval: Number.isFinite(parsed) && parsed > 0 ? parsed : 5,
    verificationUrl: DEVICE_VERIFICATION_URL,
  }
}

export const pollDeviceAuth = async (
  deviceAuthId: string,
  userCode: string,
): Promise<DevicePollResult> => {
  const res = await fetch(`${DEVICE_AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device_auth_id: deviceAuthId, user_code: userCode }),
  })
  if (res.status === 403 || res.status === 404) return { status: 'pending' }
  if (!res.ok) throw new Error(`Device auth poll failed: HTTP ${res.status}`)
  const json = (await res.json()) as {
    authorization_code: string
    code_verifier: string
  }
  if (!json.authorization_code || !json.code_verifier) {
    throw new Error('Device auth poll returned an unexpected shape')
  }
  const exchange = await fetch(CODEX_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CODEX_OAUTH_CLIENT_ID,
      code: json.authorization_code,
      code_verifier: json.code_verifier,
      redirect_uri: 'https://auth.openai.com/deviceauth/callback',
    }),
  })
  if (!exchange.ok) throw new Error(`Device auth exchange failed: HTTP ${exchange.status}`)
  const tokens = (await exchange.json()) as {
    access_token: string
    refresh_token: string
    id_token?: string
    expires_in?: number
  }
  return {
    status: 'complete',
    tokens: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresInSec: tokens.expires_in,
    },
  }
}

export const refreshCodexToken = async (
  refreshToken: string,
): Promise<RefreshedTokens> => {
  const res = await fetch(CODEX_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CODEX_OAUTH_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) throw new Error(`Codex token refresh failed: HTTP ${res.status}`)
  const json = (await res.json()) as {
    access_token: string
    refresh_token?: string
    id_token?: string
    expires_in?: number
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    idToken: json.id_token,
    expiresInSec: json.expires_in,
  }
}
