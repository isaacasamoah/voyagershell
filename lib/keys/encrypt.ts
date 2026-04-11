// AES-256-GCM encryption for BYO API keys.
//
// Uses Node's native crypto. The server key is read from the ENCRYPTION_KEY
// env var and may be supplied as hex (64 chars) or base64 (44 chars incl
// padding) -- we auto-detect. Each encryption generates a fresh 12-byte IV.
//
// NEVER log plaintext keys. Hints are last-4-chars only.

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12

export interface EncryptedPayload {
  ciphertext: string // base64
  iv: string // base64
  authTag: string // base64
}

/**
 * Load the 32-byte server encryption key from the env.
 * Accepts hex (64 chars) or base64 (44 chars). Throws on misconfiguration.
 */
const loadServerKey = (): Buffer => {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY env var is not set. BYO key storage is disabled.'
    )
  }

  let key: Buffer
  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length === 64) {
    key = Buffer.from(raw, 'hex')
  } else {
    key = Buffer.from(raw, 'base64')
  }

  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Use 64 hex chars or a 32-byte base64 string.`
    )
  }
  return key
}

/**
 * Encrypt a plaintext API key.
 * Returns base64 ciphertext, iv, and GCM auth tag.
 */
export const encryptApiKey = (plaintext: string): EncryptedPayload => {
  const key = loadServerKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

/**
 * Decrypt a ciphertext back to the original plaintext API key.
 * Any authentication failure throws -- do not catch blindly, treat as
 * tampered data.
 */
export const decryptApiKey = (payload: EncryptedPayload): string => {
  const key = loadServerKey()
  const iv = Buffer.from(payload.iv, 'base64')
  const authTag = Buffer.from(payload.authTag, 'base64')
  const ciphertext = Buffer.from(payload.ciphertext, 'base64')

  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(authTag)

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}

/**
 * Last-4-chars hint suitable for the UI. Returns the whole string if it's
 * shorter than 4 chars.
 */
export const keyHint = (plaintext: string): string => {
  if (!plaintext) return ''
  return plaintext.length <= 4 ? plaintext : plaintext.slice(-4)
}
