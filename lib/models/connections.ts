// Brain-connections data layer.
// Reads/writes encrypted subscription credentials, refreshes proactively near
// expiry with optimistic concurrency (safe under concurrent serverless calls).

import { getAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/debug'
import { seal, open } from './encryption'
import {
  createCodexModel,
  refreshCodexToken,
  readCodexMetadata,
  type CodexCredential,
} from './codex'
import type { LanguageModel } from 'ai'

const TABLE = 'brain_connections'
const REFRESH_SKEW_MS = 2 * 60 * 1000 // refresh if within 2 min of expiry

interface ConnectionRow {
  id: string
  user_id: string
  kind: string
  provider: string
  encrypted_payload: string
  iv: string
  auth_tag: string
  account_id: string | null
  plan_type: string | null
  token_expires_at: string | null
  status: string
  updated_at: string
}

interface OAuthPayload {
  access_token: string
  refresh_token: string
  id_token?: string
}

// The admin client is typed to the generated Database (no brain_connections
// yet) — contain the untyped access here rather than leaking `any` outward.
const table = () => (getAdminClient() as unknown as {
  from: (t: string) => any
}).from(TABLE)

export interface UpsertCodexInput {
  userId: string
  accessToken: string
  refreshToken: string
  idToken?: string
}

/** Encrypt + store (or replace) a user's codex subscription credential. */
export const upsertCodexConnection = async (input: UpsertCodexInput): Promise<void> => {
  const payload: OAuthPayload = {
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
    id_token: input.idToken,
  }
  const sealed = seal(JSON.stringify(payload))
  const meta = readCodexMetadata(input.accessToken, input.idToken)

  const { error } = await table().upsert(
    {
      user_id: input.userId,
      kind: 'subscription_oauth',
      provider: 'openai',
      encrypted_payload: sealed.ciphertext,
      iv: sealed.iv,
      auth_tag: sealed.authTag,
      account_id: meta.accountId ?? null,
      plan_type: meta.planType ?? null,
      token_expires_at: meta.expiresAt?.toISOString() ?? null,
      status: 'active',
      last_refresh_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider,kind' },
  )
  if (error) throw new Error(`Failed to store connection: ${error.message}`)
}

const decodePayload = (row: ConnectionRow): OAuthPayload =>
  JSON.parse(open({ ciphertext: row.encrypted_payload, iv: row.iv, authTag: row.auth_tag }))

/**
 * Refresh a row's tokens and write them back under optimistic concurrency
 * (guarded on updated_at). Returns the fresh access token, or the existing one
 * if another writer won the race. Marks status=needs_attention on hard failure.
 */
const refreshRow = async (row: ConnectionRow, payload: OAuthPayload): Promise<string> => {
  try {
    const fresh = await refreshCodexToken(payload.refresh_token)
    const meta = readCodexMetadata(fresh.accessToken, fresh.idToken ?? payload.id_token)
    const sealed = seal(
      JSON.stringify({
        access_token: fresh.accessToken,
        refresh_token: fresh.refreshToken,
        id_token: fresh.idToken ?? payload.id_token,
      } satisfies OAuthPayload),
    )
    const { data, error } = await table()
      .update({
        encrypted_payload: sealed.ciphertext,
        iv: sealed.iv,
        auth_tag: sealed.authTag,
        account_id: meta.accountId ?? row.account_id,
        plan_type: meta.planType ?? row.plan_type,
        token_expires_at: meta.expiresAt?.toISOString() ?? null,
        status: 'active',
        last_refresh_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('updated_at', row.updated_at) // optimistic guard
      .select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      // Another writer refreshed first — re-read and use whatever is current.
      const current = await getActiveCodexConnection(row.user_id)
      return current?.accessToken ?? fresh.accessToken
    }
    return fresh.accessToken
  } catch (err) {
    log.api('Codex refresh failed', { error: String(err) }, 'error')
    await table().update({ status: 'needs_attention' }).eq('id', row.id)
    throw err
  }
}

/** Find the user's own active connection, else one shared to their household
 *  voyage (the voyage IS the household — migration 035). */
const findConnectionRow = async (userId: string): Promise<ConnectionRow | null> => {
  const { data, error } = await table()
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'openai')
    .eq('kind', 'subscription_oauth')
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    log.api('Failed to read brain connection', { error: error.message }, 'warn')
    return null
  }
  if (data) return data as ConnectionRow

  // Household fallback — TESTING SCOPE ONLY. Gated to the single voyage named
  // by HOUSEHOLD_SHARE_VOYAGE (unset = feature off). Deliberately NOT a
  // general multi-user-subscription mechanism; it exists so the household can
  // test together on one plan.
  const householdSlug = process.env.HOUSEHOLD_SHARE_VOYAGE
  if (!householdSlug) return null

  const admin = getAdminClient() as unknown as { from: (t: string) => any }
  const { data: membership, error: mErr } = await admin
    .from('voyage_members')
    .select('voyage_id, voyages!inner(slug)')
    .eq('user_id', userId)
    .eq('voyages.slug', householdSlug)
    .maybeSingle()
  if (mErr || !membership) return null

  const { data: shared, error: sErr } = await table()
    .select('*')
    .eq('shared_voyage_slug', householdSlug)
    .eq('provider', 'openai')
    .eq('kind', 'subscription_oauth')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (sErr) {
    log.api('Failed to read household connection', { error: sErr.message }, 'warn')
    return null
  }
  return (shared as ConnectionRow) ?? null
}

/**
 * Get a usable codex credential for a user — their own connection, else the
 * household voyage's shared one — refreshing if near expiry.
 * Returns null when nothing resolves.
 */
export const getActiveCodexConnection = async (
  userId: string,
): Promise<CodexCredential | null> => {
  const row = await findConnectionRow(userId)
  if (!row) return null

  const payload = decodePayload(row)

  const expMs = row.token_expires_at ? Date.parse(row.token_expires_at) : 0
  const needsRefresh = !expMs || expMs - Date.now() < REFRESH_SKEW_MS

  const accessToken = needsRefresh ? await refreshRow(row, payload) : payload.access_token
  const meta = readCodexMetadata(accessToken, payload.id_token)
  const accountId = meta.accountId ?? row.account_id
  if (!accountId) {
    log.api('Codex connection missing account id', {}, 'warn')
    return null
  }
  return { accessToken, accountId }
}

/** Build a codex LanguageModel for a user, or null if unconnected. */
export const getUserCodexModel = async (userId: string): Promise<LanguageModel | null> => {
  const cred = await getActiveCodexConnection(userId)
  return cred ? createCodexModel(cred) : null
}
