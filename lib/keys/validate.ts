// Per-provider lightweight key validation.
//
// The goal is a cheap, fast probe -- enough to catch obvious typos and
// dead keys, not a full integration test. All calls time out at 8s.
//
// Contract: returns { valid: boolean; reason?: string }
// Any unexpected error is surfaced as reason, not thrown.

import type { KeyProvider } from './types'

const TIMEOUT_MS = 8000

export interface ValidationResult {
  valid: boolean
  reason?: string
}

const withTimeout = async (
  fn: (signal: AbortSignal) => Promise<Response>
): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fn(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

const validateAnthropic = async (apiKey: string): Promise<ValidationResult> => {
  try {
    const res = await withTimeout((signal) =>
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      })
    )
    // 200 = obviously valid. 400 = request shape wrong but key accepted.
    // 401/403 = invalid key.
    if (res.status === 401 || res.status === 403) {
      return { valid: false, reason: 'Anthropic rejected the key' }
    }
    return { valid: true }
  } catch (err) {
    return { valid: false, reason: `Anthropic probe failed: ${errMsg(err)}` }
  }
}

const validateOpenAI = async (
  apiKey: string,
  baseUrl?: string
): Promise<ValidationResult> => {
  try {
    const base = (baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
    const res = await withTimeout((signal) =>
      fetch(`${base}/models`, {
        signal,
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    )
    if (res.status === 401 || res.status === 403) {
      return { valid: false, reason: 'OpenAI rejected the key' }
    }
    if (!res.ok && res.status >= 500) {
      return { valid: false, reason: `OpenAI upstream error (${res.status})` }
    }
    return { valid: true }
  } catch (err) {
    return { valid: false, reason: `OpenAI probe failed: ${errMsg(err)}` }
  }
}

const validateGoogle = async (apiKey: string): Promise<ValidationResult> => {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    const res = await withTimeout((signal) => fetch(url, { signal }))
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { valid: false, reason: 'Google rejected the key' }
    }
    return { valid: true }
  } catch (err) {
    return { valid: false, reason: `Google probe failed: ${errMsg(err)}` }
  }
}

const validateOpenRouter = async (apiKey: string): Promise<ValidationResult> => {
  try {
    const res = await withTimeout((signal) =>
      fetch('https://openrouter.ai/api/v1/auth/key', {
        signal,
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    )
    if (res.status === 401 || res.status === 403) {
      return { valid: false, reason: 'OpenRouter rejected the key' }
    }
    return { valid: true }
  } catch (err) {
    return { valid: false, reason: `OpenRouter probe failed: ${errMsg(err)}` }
  }
}

const validateCustom = async (
  apiKey: string,
  baseUrl?: string
): Promise<ValidationResult> => {
  if (!baseUrl) {
    return { valid: false, reason: 'custom provider requires base_url' }
  }
  try {
    const base = baseUrl.replace(/\/+$/, '')
    const res = await withTimeout((signal) =>
      fetch(`${base}/models`, {
        signal,
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    )
    // Self-hosted servers (ollama etc.) don't always expose /models --
    // treat 404 as "accepted-but-unknown", i.e. accept the key and move on.
    if (res.status === 404) return { valid: true }
    if (res.status === 401 || res.status === 403) {
      return { valid: false, reason: 'Custom endpoint rejected the key' }
    }
    if (!res.ok && res.status >= 500) {
      return {
        valid: false,
        reason: `Custom endpoint upstream error (${res.status})`,
      }
    }
    return { valid: true }
  } catch (err) {
    return { valid: false, reason: `Custom probe failed: ${errMsg(err)}` }
  }
}

const errMsg = (err: unknown): string => {
  if (err instanceof Error) return err.message
  return String(err)
}

export const validateApiKey = async (
  provider: KeyProvider,
  apiKey: string,
  baseUrl?: string
): Promise<ValidationResult> => {
  switch (provider) {
    case 'anthropic':
      return validateAnthropic(apiKey)
    case 'openai':
      return validateOpenAI(apiKey, baseUrl)
    case 'google':
      return validateGoogle(apiKey)
    case 'openrouter':
      return validateOpenRouter(apiKey)
    case 'custom':
      return validateCustom(apiKey, baseUrl)
    default:
      return { valid: false, reason: `Unknown provider: ${provider}` }
  }
}
