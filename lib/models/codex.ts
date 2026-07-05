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
 * The ChatGPT backend requires `store: false` on every Responses call — and it
 * must be set via the SDK (not just the HTTP body), so the SDK serializes
 * function-call items INLINE rather than as stored-item references the backend
 * (store:false) can't resolve. This middleware injects it into every call so
 * all call sites stay backend-agnostic.
 */
const storeFalseMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  transformParams: async ({ params }) => ({
    ...params,
    providerOptions: {
      ...params.providerOptions,
      openai: { ...(params.providerOptions?.openai ?? {}), store: false },
    },
  }),
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
    middleware: storeFalseMiddleware,
  })
  return wrapped as unknown as LanguageModel
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
