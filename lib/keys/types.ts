// BYO API key types
// Shared across encrypt/validate/resolve and the /api/keys route.

export type KeyProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'openrouter'
  | 'custom'

export type KeyPurpose = 'conversation' | 'reasoning'

export type KeyScope = 'personal' | 'voyage'

/**
 * Result of resolving a key for a runtime request.
 * This is the thing chat/agents hand to the model router.
 */
export interface ResolvedApiKey {
  provider: KeyProvider
  apiKey: string
  baseUrl?: string
  keyId: string
  scope: KeyScope
}

/**
 * Raw snake_case row as it lives in Postgres. Used internally when reading
 * from Supabase. Never sent to the UI -- ciphertext/iv/auth_tag never leave
 * this layer.
 */
export interface ApiKeyRow {
  id: string
  user_id: string
  provider: KeyProvider
  purpose: KeyPurpose
  encrypted_key: string
  iv: string
  auth_tag: string
  key_hint: string
  base_url: string | null
  voyage_slug: string | null
  is_valid: boolean
  last_validated_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Safe-for-UI shape returned from GET /api/keys.
 * Contains hints only, never plaintext or ciphertext.
 */
export interface ApiKeyRecord {
  id: string
  provider: KeyProvider
  purpose: KeyPurpose
  keyHint: string
  baseUrl: string | null
  voyageSlug: string | null
  scope: KeyScope
  isValid: boolean
  lastValidatedAt: string | null
  createdAt: string
  updatedAt: string
}

export const toApiKeyRecord = (row: ApiKeyRow): ApiKeyRecord => ({
  id: row.id,
  provider: row.provider,
  purpose: row.purpose,
  keyHint: row.key_hint,
  baseUrl: row.base_url,
  voyageSlug: row.voyage_slug,
  scope: row.voyage_slug ? 'voyage' : 'personal',
  isValid: row.is_valid,
  lastValidatedAt: row.last_validated_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})
