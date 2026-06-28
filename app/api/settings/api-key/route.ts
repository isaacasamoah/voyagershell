// Settings: BYO API key management
// POST   - validate + store an encrypted user-supplied provider key
// DELETE - clear the stored key

import { NextResponse } from 'next/server';
import { requireAuthResponse } from '@/lib/auth';
import { encryptApiKey } from '@/lib/auth/keys';
import { createClient } from '@/lib/supabase/server';

const SUPPORTED_PROVIDERS = ['anthropic', 'openai'] as const;
type Provider = (typeof SUPPORTED_PROVIDERS)[number];

// Validate a key by hitting the provider's models list endpoint.
const validateKey = async (key: string, provider: Provider): Promise<boolean> => {
  try {
    const url =
      provider === 'openai'
        ? 'https://api.openai.com/v1/models'
        : 'https://api.anthropic.com/v1/models';
    const headers: Record<string, string> =
      provider === 'openai'
        ? { Authorization: `Bearer ${key}` }
        : { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
    const res = await fetch(url, { headers });
    return res.ok;
  } catch {
    return false;
  }
};

export const POST = async (req: Request) => {
  const authResult = await requireAuthResponse();
  if (authResult instanceof Response) return authResult;
  const userId = authResult;

  const { key, provider = 'anthropic' } = await req.json();

  if (!key || typeof key !== 'string') {
    return NextResponse.json({ error: 'key required' }, { status: 400 });
  }
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: 'invalid provider' }, { status: 400 });
  }

  const valid = await validateKey(key, provider);
  if (!valid) {
    return NextResponse.json({ error: 'invalid key' }, { status: 400 });
  }

  const encrypted = encryptApiKey(key);
  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ api_key_encrypted: encrypted, api_provider: provider })
    .eq('id', userId);

  if (error) {
    return NextResponse.json({ error: 'failed to save key' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, maskedKey: '••••' + key.slice(-4) });
};

export const DELETE = async () => {
  const authResult = await requireAuthResponse();
  if (authResult instanceof Response) return authResult;
  const userId = authResult;

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ api_key_encrypted: null, api_provider: 'anthropic' })
    .eq('id', userId);

  if (error) {
    return NextResponse.json({ error: 'failed to clear key' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
};
