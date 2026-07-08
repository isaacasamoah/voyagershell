// Codex-subscription provider — rides a ChatGPT plan instead of a metered key.
//
// Requests go to the private ChatGPT backend (NOT api.openai.com):
//   https://chatgpt.com/backend-api/codex/responses
// carrying Authorization: Bearer <access_token> + chatgpt-account-id.
//
// We use @ai-sdk/openai's Responses provider pointed at that base URL. It
// speaks the Responses API shape and parses the backend's SSE stream natively
// (the backend returns an empty `output` in response.completed and emits items
// via response.output_item.done — the AI SDK builds output from the stream, so
// this quirk is handled for free). See spike 2026-07-05.

import { createOpenAI } from '@ai-sdk/openai'
import { wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from 'ai'

// Public OAuth client (no secret) — the same client id the official codex CLI uses.
export const CODEX_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
export const CODEX_TOKEN_ENDPOINT = 'https://auth.openai.com/oauth/token'
export const CODEX_BACKEND_BASE = 'https://chatgpt.com/backend-api/codex'

// One model for everything (per Isaac, 2026-07-05).
export const CODEX_MODEL = 'gpt-5.5'

export interface CodexCredential {
  accessToken: string
  accountId: string
}

/**
 * Codex-backend compatibility middleware. The ChatGPT backend has hard
 * constraints the public API doesn't (all verified live, 2026-07-06):
 *
 * 1. `store: false` required on every call — and set via the SDK (not the HTTP
 *    body) so function-call items serialize INLINE rather than as stored-item
 *    references the backend can't resolve.
 * 2. `max_output_tokens` is an unsupported parameter → 400. Strip it (and the
 *    sampling params reasoning models reject) from every call.
 * 3. `stream: true` required — non-streaming calls 400 with "Stream must be
 *    set to true". `wrapGenerate` satisfies generateText/generateObject
 *    callers by running the stream internally and aggregating the result.
 */
const codexCompatMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  transformParams: async ({ params }) => ({
    ...params,
    maxOutputTokens: undefined, // unsupported parameter on the codex backend
    temperature: undefined,
    topP: undefined,
    frequencyPenalty: undefined,
    presencePenalty: undefined,
    providerOptions: {
      ...params.providerOptions,
      openai: { ...(params.providerOptions?.openai ?? {}), store: false },
    },
  }),
  wrapGenerate: async ({ doStream }) => {
    // Backend only streams — aggregate the stream into a generate result.
    const { stream, ...rest } = await doStream()
    const reader = stream.getReader()
    const content: Record<string, unknown>[] = []
    const textParts = new Map<string, string>()
    let finishReason: unknown = 'stop'
    let usage: unknown = {}
    let warnings: unknown[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const part = value as { type: string } & Record<string, unknown>
      switch (part.type) {
        case 'stream-start':
          warnings = (part.warnings as unknown[]) ?? []
          break
        case 'text-delta': {
          const id = (part.id as string) ?? 'text-0'
          textParts.set(id, (textParts.get(id) ?? '') + ((part.delta as string) ?? ''))
          break
        }
        case 'tool-call':
          content.push({ ...part })
          break
        case 'finish':
          finishReason = part.finishReason ?? 'stop'
          usage = part.usage ?? usage
          break
        case 'error':
          throw part.error
        default:
          break
      }
    }
    textParts.forEach((text) => content.push({ type: 'text', text }))
    return { content, finishReason, usage, warnings, ...rest } as never
  },
}

/**
 * Build an AI SDK LanguageModel bound to a user's subscription credential.
 * The access token becomes the Bearer; the account id + codex headers are
 * injected on every request.
 */
export const createCodexModel = (cred: CodexCredential): LanguageModel => {
  const provider = createOpenAI({
    apiKey: cred.accessToken, // → Authorization: Bearer <access_token>
    baseURL: CODEX_BACKEND_BASE, // → POST {base}/responses = /codex/responses
    headers: {
      'chatgpt-account-id': cred.accountId,
      'OpenAI-Beta': 'responses=experimental',
      originator: 'codex_cli_rs',
    },
  })
  // Cast across a duplicated @ai-sdk/provider copy (openai's nested version vs
  // the top-level one). Runtime shapes are identical; only the type identity
  // differs — same reason the app pins one provider version in package.json.
  const wrapped = wrapLanguageModel({
    model: provider.responses(CODEX_MODEL) as never,
    middleware: codexCompatMiddleware,
  })
  return wrapped as unknown as LanguageModel
}

// =============================================================================
// Device-code connect flow (the self-serve path — /connect)
// Wire protocol verified against openai/codex device_code_auth.rs + the
// tumf/opencode-openai-device-auth implementation, 2026-07-06. See
// ~/obsidian/Projects/voyager/research/device-auth-flow-2026-07-06.md
// PREREQ per user: ChatGPT → Settings → Security → "Allow device code login".
// =============================================================================

const DEVICE_AUTH_BASE = 'https://auth.openai.com/api/accounts/deviceauth'
export const DEVICE_VERIFICATION_URL = 'https://auth.openai.com/codex/device'

export interface DeviceAuthStart {
  deviceAuthId: string
  userCode: string
  /** Poll interval in seconds. */
  interval: number
  verificationUrl: string
}

/** Begin a device-code login: returns the code the user enters at the
 *  verification URL. */
export const startDeviceAuth = async (): Promise<DeviceAuthStart> => {
  const res = await fetch(`${DEVICE_AUTH_BASE}/usercode`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: CODEX_OAUTH_CLIENT_ID }),
  })
  if (!res.ok) {
    throw new Error(`Device auth start failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  }
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
  const interval = typeof json.interval === 'string' ? parseInt(json.interval, 10) : (json.interval ?? 5)
  return {
    deviceAuthId: json.device_auth_id,
    userCode,
    interval: Number.isFinite(interval) && interval > 0 ? interval : 5,
    verificationUrl: DEVICE_VERIFICATION_URL,
  }
}

export type DevicePollResult =
  | { status: 'pending' }
  | { status: 'complete'; tokens: RefreshedTokens }

/** One poll attempt. 403/404 = user hasn't approved yet. On success the
 *  backend hands us a server-minted PKCE pair + authorization code, which we
 *  immediately exchange for tokens. */
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
  if (!res.ok) {
    throw new Error(`openai device-auth hiccup (poll) — usually temporary, grab a fresh code. HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  }
  const json = (await res.json()) as { authorization_code: string; code_verifier: string }
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
  if (!exchange.ok) {
    throw new Error(`openai device-auth hiccup (exchange) — usually temporary, grab a fresh code. HTTP ${exchange.status} ${(await exchange.text()).slice(0, 200)}`)
  }
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

export interface RefreshedTokens {
  accessToken: string
  refreshToken: string
  idToken?: string
  expiresInSec?: number
}

/**
 * Exchange a refresh token for a fresh access token at the OpenAI OAuth
 * endpoint (grant_type=refresh_token, public client, no secret).
 */
export const refreshCodexToken = async (refreshToken: string): Promise<RefreshedTokens> => {
  const res = await fetch(CODEX_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CODEX_OAUTH_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Codex token refresh failed: HTTP ${res.status} ${body.slice(0, 200)}`)
  }
  const json = (await res.json()) as {
    access_token: string
    refresh_token?: string
    id_token?: string
    expires_in?: number
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken, // reuse if not rotated
    idToken: json.id_token,
    expiresInSec: json.expires_in,
  }
}

/** Decode a JWT payload without verifying (we only read non-secret claims). */
export const decodeJwtClaims = (jwt: string): Record<string, unknown> => {
  const part = jwt.split('.')[1]
  if (!part) return {}
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    return {}
  }
}

/** Pull account id + plan + exp out of a codex token pair. */
export const readCodexMetadata = (
  accessToken: string,
  idToken?: string,
): { accountId?: string; planType?: string; expiresAt?: Date } => {
  const claims = decodeJwtClaims(accessToken)
  const auth = (claims['https://api.openai.com/auth'] ?? {}) as Record<string, unknown>
  const idAuth = idToken
    ? ((decodeJwtClaims(idToken)['https://api.openai.com/auth'] ?? {}) as Record<string, unknown>)
    : {}
  const accountId =
    (auth.chatgpt_account_id as string | undefined) ??
    (idAuth.chatgpt_account_id as string | undefined)
  const planType =
    (auth.chatgpt_plan_type as string | undefined) ??
    (idAuth.chatgpt_plan_type as string | undefined)
  const exp = typeof claims.exp === 'number' ? new Date(claims.exp * 1000) : undefined
  return { accountId, planType, expiresAt: exp }
}
