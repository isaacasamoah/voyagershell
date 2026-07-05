#!/usr/bin/env node
// Connect your local ChatGPT/Codex subscription as a Voyager brain connection.
//
// Reads ~/.codex/auth.json (from `codex login`), encrypts the OAuth tokens with
// the app's ENCRYPTION_KEY (AES-256-GCM, identical scheme to lib/models/
// encryption.ts), and upserts a row into brain_connections via the Supabase
// service role. Run once per machine; refresh is handled server-side thereafter.
//
// Usage:
//   node scripts/connect-codex.mjs              # uses VOYAGER_USER_EMAIL from env
//   node scripts/connect-codex.mjs you@mail.com # explicit email
//
// Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
// ENCRYPTION_KEY. (Loaded automatically from repo-root .env.local.)

import { readFileSync } from 'node:fs'
import { createCipheriv, randomBytes } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// --- tiny .env.local loader (no dependency) ---
const loadEnv = () => {
  try {
    const raw = readFileSync(path.join(REPO_ROOT, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const key = m[1]
      let val = m[2].trim().replace(/^["']|["']$/g, '')
      if (!(key in process.env)) process.env[key] = val
    }
  } catch {
    /* .env.local optional if vars already in env */
  }
}
loadEnv()

const die = (msg) => {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SECRET_KEY
const encKeyRaw = process.env.ENCRYPTION_KEY
const email = process.argv[2] || process.env.VOYAGER_USER_EMAIL

if (!url || !serviceKey) die('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY')
if (!encKeyRaw) die('Missing ENCRYPTION_KEY (generate: openssl rand -hex 32)')
if (!email) die('No user email — pass as arg or set VOYAGER_USER_EMAIL')

// --- encryption (mirror of lib/models/encryption.ts) ---
const getKey = () => {
  const key = /^[0-9a-fA-F]{64}$/.test(encKeyRaw)
    ? Buffer.from(encKeyRaw, 'hex')
    : Buffer.from(encKeyRaw, 'base64')
  if (key.length !== 32) die('ENCRYPTION_KEY must decode to 32 bytes (hex 64 chars or base64)')
  return key
}
const seal = (plaintext) => {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return { ciphertext: ct.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') }
}

const decodeJwt = (t) => {
  try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8')) } catch { return {} }
}

// --- read codex auth ---
const authPath = path.join(os.homedir(), '.codex', 'auth.json')
let auth
try {
  auth = JSON.parse(readFileSync(authPath, 'utf8'))
} catch {
  die(`Could not read ${authPath} — run \`codex login\` first`)
}
const tokens = auth.tokens ?? {}
if (!tokens.access_token || !tokens.refresh_token) {
  die('auth.json has no OAuth tokens — is this a subscription login (not --with-api-key)?')
}
const claims = decodeJwt(tokens.access_token)
const authClaim = claims['https://api.openai.com/auth'] ?? {}
const accountId = tokens.account_id || authClaim.chatgpt_account_id
const planType = authClaim.chatgpt_plan_type ?? null
const expiresAt = claims.exp ? new Date(claims.exp * 1000).toISOString() : null
if (!accountId) die('Could not read chatgpt-account-id from token')

const sealed = seal(JSON.stringify({
  access_token: tokens.access_token,
  refresh_token: tokens.refresh_token,
  id_token: tokens.id_token,
}))

// --- resolve user + upsert ---
const db = createClient(url, serviceKey)

const { data: list, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 })
if (listErr) die(`Failed to list users: ${listErr.message}`)
const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
if (!user) die(`No Voyager user with email ${email}`)

const { error: upErr } = await db.from('brain_connections').upsert(
  {
    user_id: user.id,
    kind: 'subscription_oauth',
    provider: 'openai',
    encrypted_payload: sealed.ciphertext,
    iv: sealed.iv,
    auth_tag: sealed.authTag,
    account_id: accountId,
    plan_type: planType,
    token_expires_at: expiresAt,
    status: 'active',
    last_refresh_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  { onConflict: 'user_id,provider,kind' },
)
if (upErr) die(`Failed to store connection: ${upErr.message}`)

console.log(`✓ Connected ${email}'s ${planType ?? 'ChatGPT'} subscription as a Voyager brain.`)
console.log(`  account=${accountId.slice(0, 8)}…  token valid until ${expiresAt ?? 'unknown'}`)
console.log('  Every Voyager conversation now runs on your subscription — zero API spend.')
