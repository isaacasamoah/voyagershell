// Key resolution for runtime LLM calls.
//
// Resolution chain (Isaac's binding cut -- NO server env fallback for user chat):
//   1. User's personal key for the requested purpose
//   2. User's personal key for the OTHER purpose (one-key fallback)
//   3. Voyage captain's shared key for the requested purpose (if voyage scope)
//   4. Voyage captain's shared key for the OTHER purpose (if voyage scope)
//   5. null -- caller returns NO_KEY_ERROR
//
// When multiple keys are available within a single step of the chain,
// providers are tried in this deterministic order:
//   anthropic > openai > google > openrouter > custom
//
// Note: the api_keys table is not yet in the generated Supabase types,
// so reads are cast through `(supabase as any)` -- precedent: cartographer.ts
// using session_index.

import { getAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/debug'
import { decryptApiKey } from './encrypt'
import type {
  ApiKeyRow,
  KeyProvider,
  KeyPurpose,
  ResolvedApiKey,
} from './types'

export const NO_KEY_ERROR =
  'No LLM API key configured. Say "add my key" in chat to set one up.'

const PROVIDER_PRIORITY: KeyProvider[] = [
  'anthropic',
  'openai',
  'google',
  'openrouter',
  'custom',
]

const otherPurpose = (purpose: KeyPurpose): KeyPurpose =>
  purpose === 'conversation' ? 'reasoning' : 'conversation'

/**
 * Pick the best row from a candidate list using deterministic provider priority.
 * Prefers rows marked is_valid = true; falls back to any row if none are valid
 * (the caller will surface validation issues).
 */
const pickByPriority = (rows: ApiKeyRow[]): ApiKeyRow | null => {
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => {
    // Valid keys first
    if (a.is_valid !== b.is_valid) return a.is_valid ? -1 : 1
    const ai = PROVIDER_PRIORITY.indexOf(a.provider)
    const bi = PROVIDER_PRIORITY.indexOf(b.provider)
    return ai - bi
  })
  return sorted[0]
}

const rowToResolved = (
  row: ApiKeyRow,
  scope: 'personal' | 'voyage'
): ResolvedApiKey | null => {
  try {
    const apiKey = decryptApiKey({
      ciphertext: row.encrypted_key,
      iv: row.iv,
      authTag: row.auth_tag,
    })
    return {
      provider: row.provider,
      apiKey,
      baseUrl: row.base_url ?? undefined,
      keyId: row.id,
      scope,
    }
  } catch (err) {
    log.api(
      'Key decryption failed',
      { keyId: row.id, error: String(err) },
      'error'
    )
    return null
  }
}

interface ResolveOptions {
  voyageSlug?: string
}

/**
 * Resolve the best API key to use for this (user, purpose) combination.
 * Returns null when nothing is configured (caller should return NO_KEY_ERROR).
 */
export const resolveApiKey = async (
  userId: string,
  purpose: KeyPurpose,
  options: ResolveOptions = {}
): Promise<ResolvedApiKey | null> => {
  const supabase = getAdminClient()
  const { voyageSlug } = options

  // ---------------------------------------------------------------------------
  // Step 1 + 2: personal keys (exact purpose, then other purpose)
  // ---------------------------------------------------------------------------
  const { data: personalRows, error: personalErr } = await (supabase as any)
    .from('api_keys')
    .select('*')
    .eq('user_id', userId)
    .is('voyage_slug', null)

  if (personalErr) {
    log.api(
      'Failed to load personal keys',
      { userId, error: personalErr.message },
      'error'
    )
  }

  const personal = (personalRows ?? []) as ApiKeyRow[]
  const personalExact = personal.filter((r) => r.purpose === purpose)
  const personalOther = personal.filter((r) => r.purpose === otherPurpose(purpose))

  const personalExactPick = pickByPriority(personalExact)
  if (personalExactPick) {
    const resolved = rowToResolved(personalExactPick, 'personal')
    if (resolved) return resolved
  }

  const personalOtherPick = pickByPriority(personalOther)
  if (personalOtherPick) {
    const resolved = rowToResolved(personalOtherPick, 'personal')
    if (resolved) return resolved
  }

  // ---------------------------------------------------------------------------
  // Step 3 + 4: voyage captain's shared key (only if voyage scope)
  // ---------------------------------------------------------------------------
  if (voyageSlug) {
    const { data: voyageRows, error: voyageErr } = await (supabase as any)
      .from('api_keys')
      .select('*')
      .eq('voyage_slug', voyageSlug)

    if (voyageErr) {
      log.api(
        'Failed to load voyage keys',
        { voyageSlug, error: voyageErr.message },
        'error'
      )
    }

    const voyage = (voyageRows ?? []) as ApiKeyRow[]
    const voyageExact = voyage.filter((r) => r.purpose === purpose)
    const voyageOther = voyage.filter((r) => r.purpose === otherPurpose(purpose))

    const voyageExactPick = pickByPriority(voyageExact)
    if (voyageExactPick) {
      const resolved = rowToResolved(voyageExactPick, 'voyage')
      if (resolved) return resolved
    }

    const voyageOtherPick = pickByPriority(voyageOther)
    if (voyageOtherPick) {
      const resolved = rowToResolved(voyageOtherPick, 'voyage')
      if (resolved) return resolved
    }
  }

  return null
}
