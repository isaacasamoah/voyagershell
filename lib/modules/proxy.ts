// Module proxy — HTTP escape hatch for declarative modules.
//
// Slice 6B (skeleton). The goal of this file is to lock in the SHAPE of the
// proxy so downstream work (auth storage, real rate limiting, audit table)
// can slot in without breaking callers.
//
// Security posture:
//   * URL-template only. The caller passes a ConnectionTemplate plus
//     pathParams/queryParams; the proxy refuses anything that would escape
//     the declared template (path traversal, foreign origin).
//   * No arbitrary HTTP. If the template slot is not understood, the call
//     is refused.
//   * Auth injection is STUBBED. Only `auth.kind === 'none'` is implemented
//     in Slice 6. `api_key` and `oauth2` types exist in the type space but
//     throw NOT_IMPLEMENTED at runtime, with a pointer to the auth-storage
//     recommendation attached to the Slice 6 report.
//   * Rate limiting is an in-memory sliding window keyed by (moduleId,
//     userId). This is per-lambda-instance only — on Vercel serverless
//     this means rate limits drift across cold starts and concurrent
//     instances. A future slice should move this to KV / Redis. The
//     intentional limitation is called out on the rate-limiter code.
//   * Audit logging goes through log.agent() with structured fields so a
//     future `module_proxy_audit` table can consume the same payload.
//   * fetch() runs with a 30-second timeout via AbortSignal.timeout().

import { log } from '@/lib/debug'

// ============================================================================
// Types
// ============================================================================

/**
 * Auth specification for a module connection.
 *
 * Only `kind: 'none'` is implemented in Slice 6. The other variants exist
 * in the type space so callers can round-trip real connection definitions
 * once auth storage lands — but they throw NOT_IMPLEMENTED at runtime.
 *
 * `keyRef` / `tokenRef` are deliberately opaque strings — the proxy does
 * not know where the secret lives. The resolver (to be built in a later
 * slice, per the auth-storage recommendation) owns that.
 */
export type AuthSpec =
  | { kind: 'none' }
  | { kind: 'api_key'; headerName: string; keyRef: string }
  | { kind: 'oauth2'; tokenRef: string }

export interface RateLimitConfig {
  perMinute: number
}

/**
 * A ConnectionTemplate describes exactly one HTTP endpoint reachable via
 * the proxy. Modules may declare multiple templates; each call resolves
 * exactly one.
 *
 * URL construction:
 *   baseUrl   = 'https://api.example.com'
 *   pathTemplate = '/v1/users/{userId}/posts'
 *   pathParams   = { userId: 'abc' }
 *   queryParams  = { limit: '10' }
 *   → https://api.example.com/v1/users/abc/posts?limit=10
 *
 * baseUrl MUST be a bare https origin (no path, no query). pathTemplate
 * owns everything after the origin.
 */
export interface ConnectionTemplate {
  id: string
  baseUrl: string
  pathTemplate: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  rateLimit?: RateLimitConfig
  auth: AuthSpec
}

export interface ExecuteModuleCallInput {
  moduleId: string
  connectionTemplate: ConnectionTemplate
  pathParams?: Record<string, string>
  queryParams?: Record<string, string>
  /** Optional JSON body for POST/PUT/PATCH. */
  body?: unknown
  userId: string
}

export type ProxyResult =
  | { ok: true; status: number; body: unknown }
  | {
      ok: false
      error: string
      code:
        | 'TEMPLATE_VIOLATION'
        | 'MISSING_PATH_PARAM'
        | 'RATE_LIMITED'
        | 'NOT_IMPLEMENTED'
        | 'FETCH_FAILED'
        | 'TIMEOUT'
    }

// ============================================================================
// Rate limiting (in-memory, per-lambda-instance)
// ============================================================================
//
// Known limitation: this map lives in module scope of a single Node process.
// On Vercel serverless that means:
//   * Cold starts reset the window.
//   * Concurrent lambda instances each hold their own counters.
//   * Effective rate limit is O(N instances) × perMinute.
// This is acceptable as a v1 soft limit. A real slice should back this
// with KV / Redis / Upstash. Marked in the audit recommendation.

interface RateLimitEntry {
  /** Unix ms timestamps of recent calls, oldest first. */
  timestamps: number[]
}

const RATE_LIMIT_WINDOW_MS = 60_000
const DEFAULT_PER_MINUTE = 30

const rateLimitState = new Map<string, RateLimitEntry>()

const rateLimitKey = (moduleId: string, userId: string): string =>
  `${moduleId}:${userId}`

const checkRateLimit = (
  moduleId: string,
  userId: string,
  perMinute: number
): { allowed: boolean; remaining: number } => {
  const key = rateLimitKey(moduleId, userId)
  const now = Date.now()
  const cutoff = now - RATE_LIMIT_WINDOW_MS

  const entry = rateLimitState.get(key) ?? { timestamps: [] }
  // Drop anything older than the window.
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff)

  if (entry.timestamps.length >= perMinute) {
    rateLimitState.set(key, entry)
    return { allowed: false, remaining: 0 }
  }

  entry.timestamps.push(now)
  rateLimitState.set(key, entry)
  return { allowed: true, remaining: perMinute - entry.timestamps.length }
}

// ============================================================================
// URL resolution
// ============================================================================

const BASE_URL_RE = /^https:\/\/[a-z0-9.-]+(?::\d+)?$/
const PATH_PARAM_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g

/**
 * Resolve a ConnectionTemplate + params into an absolute URL. Returns a
 * Result-shaped value so the caller can surface structured errors.
 *
 * Rejects:
 *   - baseUrl that isn't a plain https origin
 *   - pathParams containing '..' (path traversal)
 *   - pathParams containing '/' (slot escape)
 *   - unresolved path slots
 *   - URL whose final origin no longer matches baseUrl
 */
const resolveUrl = (
  template: ConnectionTemplate,
  pathParams: Record<string, string> = {},
  queryParams: Record<string, string> = {}
):
  | { ok: true; url: string }
  | { ok: false; error: string; code: 'TEMPLATE_VIOLATION' | 'MISSING_PATH_PARAM' } => {
  if (!BASE_URL_RE.test(template.baseUrl)) {
    return {
      ok: false,
      code: 'TEMPLATE_VIOLATION',
      error: `baseUrl "${template.baseUrl}" is not a plain https origin`,
    }
  }

  // Reject path param values that would break out of the template slot.
  for (const [k, v] of Object.entries(pathParams)) {
    if (typeof v !== 'string') {
      return {
        ok: false,
        code: 'TEMPLATE_VIOLATION',
        error: `path param "${k}" must be a string`,
      }
    }
    if (v.includes('/') || v.includes('..') || v.includes('\\')) {
      return {
        ok: false,
        code: 'TEMPLATE_VIOLATION',
        error: `path param "${k}" contains forbidden characters`,
      }
    }
  }

  // Substitute slots and track which were consumed.
  const unresolved: string[] = []
  const resolvedPath = template.pathTemplate.replace(PATH_PARAM_RE, (_, name: string) => {
    const v = pathParams[name]
    if (typeof v !== 'string') {
      unresolved.push(name)
      return `{${name}}`
    }
    return encodeURIComponent(v)
  })

  if (unresolved.length > 0) {
    return {
      ok: false,
      code: 'MISSING_PATH_PARAM',
      error: `unresolved path params: ${unresolved.join(', ')}`,
    }
  }

  let parsed: URL
  try {
    parsed = new URL(resolvedPath, template.baseUrl + '/')
  } catch (err) {
    return {
      ok: false,
      code: 'TEMPLATE_VIOLATION',
      error: `URL construction failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // Hard check: the resolved URL must still live on the declared origin.
  // URL normalisation collapses `..` but we already rejected those above;
  // this is a defence-in-depth check.
  if (parsed.origin !== template.baseUrl) {
    return {
      ok: false,
      code: 'TEMPLATE_VIOLATION',
      error: `resolved URL origin "${parsed.origin}" does not match template baseUrl "${template.baseUrl}"`,
    }
  }

  for (const [k, v] of Object.entries(queryParams)) {
    parsed.searchParams.set(k, v)
  }

  return { ok: true, url: parsed.toString() }
}

// ============================================================================
// Auth injection (stubbed)
// ============================================================================

const NOT_IMPLEMENTED_REASON =
  'module proxy auth storage pending — see Slice 6 recommendation'

const applyAuth = (
  auth: AuthSpec,
  headers: Headers
):
  | { ok: true }
  | { ok: false; error: string; code: 'NOT_IMPLEMENTED' } => {
  switch (auth.kind) {
    case 'none':
      return { ok: true }
    case 'api_key':
      return {
        ok: false,
        code: 'NOT_IMPLEMENTED',
        error: `api_key auth not implemented in Slice 6: ${NOT_IMPLEMENTED_REASON}`,
      }
    case 'oauth2':
      return {
        ok: false,
        code: 'NOT_IMPLEMENTED',
        error: `oauth2 auth not implemented in Slice 6: ${NOT_IMPLEMENTED_REASON}`,
      }
    default: {
      // Exhaustiveness — if a new AuthSpec variant is added, this compiles red.
      const _exhaustive: never = auth
      return {
        ok: false,
        code: 'NOT_IMPLEMENTED',
        error: `unknown auth kind: ${JSON.stringify(_exhaustive)}`,
      }
    }
  }
  // The headers arg is unused under 'none' today. It is still required in
  // the signature so the api_key implementation can mutate it in place
  // when it lands.
  void headers
}

// ============================================================================
// executeModuleCall
// ============================================================================

const FETCH_TIMEOUT_MS = 30_000

/**
 * Execute a single module call through the proxy. Returns a structured
 * result rather than throwing, so callers can map errors to tool outputs.
 */
export const executeModuleCall = async (
  input: ExecuteModuleCallInput
): Promise<ProxyResult> => {
  const { moduleId, connectionTemplate, pathParams, queryParams, body, userId } =
    input

  // --- 1. Resolve URL -------------------------------------------------------
  const resolved = resolveUrl(connectionTemplate, pathParams, queryParams)
  if (!resolved.ok) {
    log.agent(
      'module_proxy_call',
      {
        moduleId,
        userId: userId.slice(0, 8),
        url: null,
        status: 0,
        error: resolved.error,
        code: resolved.code,
      },
      'warn'
    )
    return { ok: false, error: resolved.error, code: resolved.code }
  }

  // --- 2. Rate limit --------------------------------------------------------
  const perMinute =
    connectionTemplate.rateLimit?.perMinute ?? DEFAULT_PER_MINUTE
  const rl = checkRateLimit(moduleId, userId, perMinute)
  if (!rl.allowed) {
    log.agent(
      'module_proxy_call',
      {
        moduleId,
        userId: userId.slice(0, 8),
        url: resolved.url,
        status: 429,
        error: 'rate_limited',
        code: 'RATE_LIMITED',
      },
      'warn'
    )
    return {
      ok: false,
      code: 'RATE_LIMITED',
      error: `rate limit exceeded (${perMinute}/min for module ${moduleId})`,
    }
  }

  // --- 3. Headers + auth ----------------------------------------------------
  const headers = new Headers({
    accept: 'application/json',
    'user-agent': 'voyager-module-proxy/0.1',
  })
  if (body !== undefined && connectionTemplate.method !== 'GET') {
    headers.set('content-type', 'application/json')
  }

  const authResult = applyAuth(connectionTemplate.auth, headers)
  if (!authResult.ok) {
    log.agent(
      'module_proxy_call',
      {
        moduleId,
        userId: userId.slice(0, 8),
        url: resolved.url,
        status: 0,
        error: authResult.error,
        code: authResult.code,
      },
      'warn'
    )
    return { ok: false, code: authResult.code, error: authResult.error }
  }

  // --- 4. Fetch with timeout ------------------------------------------------
  try {
    const response = await fetch(resolved.url, {
      method: connectionTemplate.method,
      headers,
      body:
        body !== undefined && connectionTemplate.method !== 'GET'
          ? JSON.stringify(body)
          : undefined,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    // Parse body. Prefer JSON, fall back to text.
    const contentType = response.headers.get('content-type') ?? ''
    let parsed: unknown
    if (contentType.includes('application/json')) {
      try {
        parsed = await response.json()
      } catch {
        parsed = null
      }
    } else {
      parsed = await response.text()
    }

    log.agent(
      'module_proxy_call',
      {
        moduleId,
        userId: userId.slice(0, 8),
        url: resolved.url,
        status: response.status,
        method: connectionTemplate.method,
        remaining: rl.remaining,
      },
      response.ok ? 'info' : 'warn'
    )

    return { ok: true, status: response.status, body: parsed }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    const errMsg = err instanceof Error ? err.message : String(err)
    log.agent(
      'module_proxy_call',
      {
        moduleId,
        userId: userId.slice(0, 8),
        url: resolved.url,
        status: 0,
        error: errMsg,
        code: isTimeout ? 'TIMEOUT' : 'FETCH_FAILED',
      },
      'error'
    )
    return {
      ok: false,
      code: isTimeout ? 'TIMEOUT' : 'FETCH_FAILED',
      error: errMsg,
    }
  }
}

// ============================================================================
// Test / admin helpers
// ============================================================================

/**
 * Clear the in-memory rate limit map. Exposed for tests and for admin
 * tooling — not for general use.
 */
export const __resetRateLimitState = (): void => {
  rateLimitState.clear()
}
