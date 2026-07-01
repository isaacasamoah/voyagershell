// BYO API key encryption + retrieval
//
// User-supplied provider keys are encrypted with AES-256-GCM before storage.
// KEY_ENCRYPTION_SECRET is a 32-byte key encoded as a 64-char hex string.
// Stored format: base64(iv):base64(ciphertext || authTag)

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';

const AUTH_TAG_BYTES = 16;
const IV_BYTES = 16;

const getEncKey = (): Buffer => {
  const hex = process.env.KEY_ENCRYPTION_SECRET;
  if (!hex || hex.length !== 64) {
    throw new Error('KEY_ENCRYPTION_SECRET must be a 32-byte hex string (64 chars)');
  }
  return Buffer.from(hex, 'hex');
};

export const encryptApiKey = (plaintext: string): string => {
  const key = getEncKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${Buffer.concat([encrypted, tag]).toString('base64')}`;
};

export const decryptApiKey = (stored: string): string => {
  const key = getEncKey();
  const [ivB64, dataB64] = stored.split(':');
  if (!ivB64 || !dataB64) {
    throw new Error('Malformed encrypted API key');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const tag = data.subarray(data.length - AUTH_TAG_BYTES);
  const encrypted = data.subarray(0, data.length - AUTH_TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};

export interface UserApiKey {
  key: string;
  provider: string;
}

export const fetchUserApiKey = async (userId: string): Promise<UserApiKey | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('api_key_encrypted, api_provider')
    .eq('id', userId)
    .single();

  const row = data as { api_key_encrypted: string | null; api_provider: string | null } | null;
  if (!row?.api_key_encrypted) return null;

  return {
    key: decryptApiKey(row.api_key_encrypted),
    provider: row.api_provider ?? 'anthropic',
  };
};
