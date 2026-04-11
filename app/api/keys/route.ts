// BYO API key management.
//
// GET    /api/keys -- list caller's keys (hints only, never ciphertext)
// POST   /api/keys -- upsert a new key (validate -> encrypt -> persist)
// DELETE /api/keys?id=<uuid> -- delete a key the caller owns
//
// Voyage-scoped writes are captain-only (enforced here via isCaptain).
// Voyage members can still READ their voyage-scoped keys because the
// resolver needs to hand them the captain's shared key at chat time.

import { NextResponse } from 'next/server'
import { requireAuthResponse } from '@/lib/auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { isCaptain } from '@/lib/voyage'
import {
  encryptApiKey,
  keyHint,
  validateApiKey,
  toApiKeyRecord,
  type ApiKeyRow,
  type KeyProvider,
  type KeyPurpose,
} from '@/lib/keys'
import { log } from '@/lib/debug'

const ALLOWED_PROVIDERS: KeyProvider[] = [
  'anthropic',
  'openai',
  'google',
  'openrouter',
  'custom',
]

const ALLOWED_PURPOSES: KeyPurpose[] = ['conversation', 'reasoning']

// -----------------------------------------------------------------------------
// GET -- list caller's keys (hints only)
// -----------------------------------------------------------------------------

export const GET = async (): Promise<Response> => {
  const authResult = await requireAuthResponse()
  if (authResult instanceof Response) return authResult
  const userId = authResult

  const supabase = getAdminClient()
  // api_keys not yet in generated Supabase types -- cast through any.
  const { data, error } = await (supabase as any)
    .from('api_keys')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    log.api('GET /api/keys list error', { error: error.message }, 'error')
    return NextResponse.json(
      { error: 'Failed to list keys', message: error.message },
      { status: 500 }
    )
  }

  const rows = (data ?? []) as ApiKeyRow[]
  const records = rows.map(toApiKeyRecord)
  return NextResponse.json({ keys: records })
}

// -----------------------------------------------------------------------------
// POST -- upsert a new key
// -----------------------------------------------------------------------------

interface PostBody {
  provider?: string
  purpose?: string
  apiKey?: string
  baseUrl?: string
  voyageSlug?: string | null
}

export const POST = async (req: Request): Promise<Response> => {
  const authResult = await requireAuthResponse()
  if (authResult instanceof Response) return authResult
  const userId = authResult

  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    )
  }

  const provider = body.provider as KeyProvider | undefined
  const purpose = body.purpose as KeyPurpose | undefined
  const apiKey = body.apiKey
  const baseUrl = body.baseUrl?.trim() || undefined
  const voyageSlug = body.voyageSlug ?? null

  if (!provider || !ALLOWED_PROVIDERS.includes(provider)) {
    return NextResponse.json(
      { error: `Invalid provider. Must be one of: ${ALLOWED_PROVIDERS.join(', ')}` },
      { status: 400 }
    )
  }
  if (!purpose || !ALLOWED_PURPOSES.includes(purpose)) {
    return NextResponse.json(
      { error: `Invalid purpose. Must be one of: ${ALLOWED_PURPOSES.join(', ')}` },
      { status: 400 }
    )
  }
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 8) {
    return NextResponse.json(
      { error: 'apiKey is required and must be at least 8 characters' },
      { status: 400 }
    )
  }
  if (provider === 'custom' && !baseUrl) {
    return NextResponse.json(
      { error: 'custom provider requires baseUrl' },
      { status: 400 }
    )
  }

  // Voyage-scoped writes: captain-only.
  if (voyageSlug) {
    const captain = await isCaptain(voyageSlug, userId)
    if (!captain) {
      return NextResponse.json(
        { error: 'Only the voyage captain can manage voyage-scoped keys' },
        { status: 403 }
      )
    }
  }

  // Validate the key (cheap probe, 8s timeout) before persisting.
  const validation = await validateApiKey(provider, apiKey, baseUrl)
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: 'Key validation failed',
        reason: validation.reason ?? 'Unknown validation failure',
      },
      { status: 400 }
    )
  }

  // Encrypt and persist.
  let encrypted
  try {
    encrypted = encryptApiKey(apiKey)
  } catch (err) {
    log.api('Encrypt failed', { error: String(err) }, 'error')
    return NextResponse.json(
      {
        error: 'Server misconfiguration',
        message:
          'ENCRYPTION_KEY is not configured on the server. Contact support.',
      },
      { status: 500 }
    )
  }

  const row: Record<string, unknown> = {
    user_id: userId,
    provider,
    purpose,
    encrypted_key: encrypted.ciphertext,
    iv: encrypted.iv,
    auth_tag: encrypted.authTag,
    key_hint: keyHint(apiKey),
    base_url: baseUrl ?? null,
    voyage_slug: voyageSlug,
    is_valid: true,
    last_validated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const conflictTarget = voyageSlug
    ? 'user_id,provider,purpose,voyage_slug'
    : 'user_id,provider,purpose'

  const supabase = getAdminClient()
  const { data, error } = await (supabase as any)
    .from('api_keys')
    .upsert(row, { onConflict: conflictTarget })
    .select('*')
    .single()

  if (error) {
    log.api('POST /api/keys upsert error', { error: error.message }, 'error')
    return NextResponse.json(
      { error: 'Failed to save key', message: error.message },
      { status: 500 }
    )
  }

  const record = toApiKeyRecord(data as ApiKeyRow)
  return NextResponse.json({ key: record }, { status: 201 })
}

// -----------------------------------------------------------------------------
// DELETE -- remove a key the caller owns
// -----------------------------------------------------------------------------

export const DELETE = async (req: Request): Promise<Response> => {
  const authResult = await requireAuthResponse()
  if (authResult instanceof Response) return authResult
  const userId = authResult

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return NextResponse.json(
      { error: 'Missing required query param: id' },
      { status: 400 }
    )
  }

  const supabase = getAdminClient()
  const { error, count } = await (supabase as any)
    .from('api_keys')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    log.api('DELETE /api/keys error', { error: error.message }, 'error')
    return NextResponse.json(
      { error: 'Failed to delete key', message: error.message },
      { status: 500 }
    )
  }

  if (!count) {
    return NextResponse.json(
      { error: 'Key not found or not owned by caller' },
      { status: 404 }
    )
  }

  return NextResponse.json({ deleted: id })
}
