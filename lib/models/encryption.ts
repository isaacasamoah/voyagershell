// Application-layer encryption for brain-connection secrets.
// AES-256-GCM. Key from ENCRYPTION_KEY env (32 bytes, hex or base64).
// Plaintext is never persisted; ciphertext + iv + auth_tag are stored separately.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export interface Sealed {
  ciphertext: string // base64
  iv: string // base64
  authTag: string // base64
}

const getKey = (): Buffer => {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('ENCRYPTION_KEY is not configured')
  // Accept 64-char hex or 44-char base64 (both decode to 32 bytes).
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to 32 bytes (256-bit)')
  }
  return key
}

export const seal = (plaintext: string): Sealed => {
  const iv = randomBytes(12) // 96-bit nonce for GCM
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  }
}

export const open = (sealed: Sealed): string => {
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(sealed.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}
