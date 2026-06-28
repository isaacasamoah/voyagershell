-- =============================================================================
-- Migration 034: User BYO API Keys
-- =============================================================================
--
-- Store a user-supplied ("bring your own") provider API key on the profile,
-- encrypted at rest (AES-256-GCM, see lib/auth/keys.ts). The encrypted blob
-- never leaves the server in plaintext.
--
-- RLS: existing profiles policies (001_slice1_schema.sql) scope SELECT/UPDATE
-- to auth.uid() = id, which already covers these columns. No new policy needed.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS api_provider TEXT DEFAULT 'anthropic',
  ADD COLUMN IF NOT EXISTS access_tier TEXT DEFAULT 'free';
