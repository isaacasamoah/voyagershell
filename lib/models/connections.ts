// Brain-connections data layer.
// Reads/writes encrypted subscription credentials, refreshes proactively near
// expiry with optimistic concurrency (safe under concurrent serverless calls).

import { getAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/debug'
import { seal, open } from './encryption'
import {
  createResilientCodexModel,
  readCodexMetadata,
  type CodexCredential,
} from './codex'
import { classifyCodexError } from './codex-auth'
import { refreshCodexToken } from './codex-device-auth'
import type { LanguageModel } from 'ai'

const TABLE = 'brain_connections'
const REFRESH_SKEW_MS = 2 * 60 * 1000 // refresh if within 2 min of expiry
const REFRESH_STALE_MS = 24 * 60 * 60 * 1000
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
  last_refresh_at: string | null
  updated_at: string
}

interface OAuthPayload {
  access_token: string
  refresh_token: string
  id_token?: string
}

class CodexAccountMismatchError extends Error {}

const table = () => getAdminClient().from(TABLE)

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

const markNeedsAttention = async (row: ConnectionRow, reason: string): Promise<void> => {
  log.api('Codex connection needs attention', {
    connectionId: row.id,
    reason,
  }, 'warn')
  const { error } = await table().update({ status: 'needs_attention' }).eq('id', row.id)
  if (error) throw new Error('Failed to update Codex connection status')
}

const credentialFor = (
  row: ConnectionRow,
  payload: OAuthPayload,
): CodexCredential | null => {
  const liveAccountId = readCodexMetadata(
    payload.access_token,
    payload.id_token,
  ).accountId
  if (!liveAccountId || !row.account_id) return null
  if (liveAccountId !== row.account_id) return null
  return { accessToken: payload.access_token, accountId: liveAccountId }
}

const refreshRow = async (
  row: ConnectionRow,
  payload: OAuthPayload,
): Promise<CodexCredential> => {
  try {
    const fresh = await refreshCodexToken(payload.refresh_token)
    const meta = readCodexMetadata(fresh.accessToken, fresh.idToken ?? payload.id_token)
    if (!meta.accountId || meta.accountId !== row.account_id) {
      throw new CodexAccountMismatchError('Codex connection account mismatch')
    }
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
        account_id: meta.accountId,
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
      if (!current) throw new Error('Codex connection unavailable after refresh race')
      return current
    }
    return { accessToken: fresh.accessToken, accountId: meta.accountId }
  } catch (err) {
    log.api('Codex refresh failed', { errorClass: classifyCodexError(err) }, 'error')
    const reason = err instanceof CodexAccountMismatchError
      ? 'account_mismatch'
      : classifyCodexError(err)
    await markNeedsAttention(row, reason)
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
  if (data) return data

  // Household fallback — TESTING SCOPE ONLY. Gated to the single voyage named
  // by HOUSEHOLD_SHARE_VOYAGE (unset = feature off). Deliberately NOT a
  // general multi-user-subscription mechanism; it exists so the household can
  // test together on one plan.
  const householdSlug = process.env.HOUSEHOLD_SHARE_VOYAGE
  if (!householdSlug) return null

  const { data: membership, error: mErr } = await getAdminClient()
    .from('voyage_members')
    .select('voyage_id, voyages!inner(slug)')
    .eq('user_id', userId)
    .eq('state', 'active')
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
  return shared ?? null
}

export const getActiveCodexConnection = async (
  userId: string,
): Promise<CodexCredential | null> => {
  const row = await findConnectionRow(userId)
  if (!row) return null

  const payload = decodePayload(row)
  const initialCredential = credentialFor(row, payload)
  if (!initialCredential) {
    await markNeedsAttention(row, 'account_mismatch')
    return null
  }

  const expMs = row.token_expires_at ? Date.parse(row.token_expires_at) : 0
  const refreshedMs = row.last_refresh_at ? Date.parse(row.last_refresh_at) : 0
  const needsRefresh = !expMs
    || expMs - Date.now() < REFRESH_SKEW_MS
    || !refreshedMs
    || Date.now() - refreshedMs >= REFRESH_STALE_MS

  return needsRefresh ? refreshRow(row, payload) : initialCredential
}

/** Build a codex LanguageModel for a user, or null if unconnected. */
export const getUserCodexModel = async (
  userId: string,
  fallback: LanguageModel,
): Promise<LanguageModel | null> => {
  const row = await findConnectionRow(userId)
  if (!row) return null
  const cred = await getActiveCodexConnection(userId)
  if (!cred) return null
  return createResilientCodexModel(cred, {
    fallback,
    refresh: async () => {
      const current = await findConnectionRow(userId)
      if (!current) throw new Error('Codex connection is not active')
      return refreshRow(current, decodePayload(current))
    },
    onFailure: async (error) => {
      await markNeedsAttention(row, classifyCodexError(error))
    },
  })
}
