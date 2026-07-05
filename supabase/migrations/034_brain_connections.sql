-- =============================================================================
-- Migration 034: Brain Connections (BYO subscription / API compute)
-- =============================================================================
--
-- Identity (magic link) is separate from COMPUTE. A person attaches one or more
-- "brain connections" — whose intelligence runs their Voyager. The first kind
-- is a ChatGPT/Codex subscription (OAuth tokens reused from `codex login`),
-- billed to the user's own plan, never to a metered API key.
--
-- Design (master plan Step 1.5, 2026-07-05):
--   * Full schema ships now; everything above the model layer is minimal.
--   * Tokens are encrypted application-side (AES-256-GCM, ENCRYPTION_KEY).
--     Plaintext is NEVER persisted and NEVER sent to the browser.
--   * Subscriptions are PERSONAL only — no voyage_slug. Sharing a subscription
--     across users is the prohibited multiplexing lane (OpenAI ToS §2b).
--   * kind is extensible: subscription_oauth today; api_key / claude_sub later
--     become new rows in the same table, same router path.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.brain_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership (personal only — no voyage scope by design)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What kind of compute this is, and from whom
  kind TEXT NOT NULL CHECK (kind IN ('subscription_oauth', 'api_key')),
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic')),

  -- Encrypted payload (AES-256-GCM; all base64). For subscription_oauth this is
  -- the JSON { access_token, refresh_token, id_token }. For api_key, the key.
  encrypted_payload TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,

  -- Non-secret metadata (safe to read for routing + UI)
  account_id TEXT,                         -- chatgpt-account-id (from JWT)
  plan_type TEXT,                          -- e.g. 'pro' (from JWT)
  token_expires_at TIMESTAMPTZ,            -- access-token exp (proactive refresh)

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'needs_attention', 'exhausted')),
  last_refresh_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active connection per (user, provider, kind) — re-connecting UPSERTs.
CREATE UNIQUE INDEX IF NOT EXISTS uq_brain_connections_user_provider_kind
  ON public.brain_connections (user_id, provider, kind);

CREATE INDEX IF NOT EXISTS idx_brain_connections_user
  ON public.brain_connections (user_id, status);

-- RLS: owner-only. Server writes go through the admin client (service role,
-- bypasses RLS); these policies protect any anon/authenticated access.
ALTER TABLE public.brain_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brain_connections_owner_select ON public.brain_connections;
CREATE POLICY brain_connections_owner_select ON public.brain_connections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS brain_connections_owner_all ON public.brain_connections;
CREATE POLICY brain_connections_owner_all ON public.brain_connections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.brain_connections IS
  'BYO compute: per-user encrypted subscription/API credentials the model router selects from. Personal only (no voyage scope) — sharing a subscription violates provider ToS.';
