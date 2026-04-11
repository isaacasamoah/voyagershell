-- =============================================================================
-- Migration 033: BYO API Keys
-- =============================================================================
--
-- Per-user encrypted API keys for Voyager's multi-provider LLM router.
--
-- Scope:
--   * Personal keys:  voyage_slug IS NULL -- used in personal space
--   * Voyage keys:    voyage_slug = '<slug>' -- the voyage captain's shared
--                     key, visible to all voyage members for chat inside
--                     that voyage.
--
-- Purpose:
--   * 'conversation' -- primary Voyager chat model
--   * 'reasoning'    -- background agents (deep retrieval, cartographer)
--
-- Providers:
--   anthropic | openai | google | openrouter | custom
--
-- Encryption (application layer):
--   AES-256-GCM using ENCRYPTION_KEY env var. Stored as base64 ciphertext,
--   iv, auth_tag. Plaintext is never persisted.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Provider + purpose
  provider TEXT NOT NULL CHECK (
    provider IN ('anthropic', 'openai', 'google', 'openrouter', 'custom')
  ),
  purpose TEXT NOT NULL CHECK (
    purpose IN ('conversation', 'reasoning')
  ),

  -- Encrypted payload (AES-256-GCM, all base64)
  encrypted_key TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,

  -- Display hint (last 4 chars of the plaintext key, for UI only)
  key_hint TEXT NOT NULL,

  -- Required for 'custom' provider (self-hosted OpenAI-compatible endpoint)
  -- Optional for 'openai' (e.g. Azure OpenAI or proxies). Ignored otherwise.
  base_url TEXT,

  -- Scope: NULL = personal, otherwise voyage captain's shared key
  voyage_slug TEXT REFERENCES public.voyages(slug) ON DELETE CASCADE,

  -- Validation state (updated by /api/keys POST)
  is_valid BOOLEAN NOT NULL DEFAULT true,
  last_validated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- custom provider MUST have a base_url
  CONSTRAINT api_keys_custom_requires_base_url CHECK (
    provider <> 'custom' OR base_url IS NOT NULL
  )
);

-- Partial unique indexes -- NULLs in regular UNIQUE are distinct in Postgres,
-- so we need these to enforce one-key-per-(provider, purpose) per scope.
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_personal_unique
  ON public.api_keys (user_id, provider, purpose)
  WHERE voyage_slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_voyage_unique
  ON public.api_keys (user_id, provider, purpose, voyage_slug)
  WHERE voyage_slug IS NOT NULL;

-- Lookup indexes for resolve.ts
CREATE INDEX IF NOT EXISTS idx_api_keys_user_purpose
  ON public.api_keys (user_id, purpose)
  WHERE voyage_slug IS NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_voyage_purpose
  ON public.api_keys (voyage_slug, purpose)
  WHERE voyage_slug IS NOT NULL;

-- updated_at trigger (reuses existing handle_updated_at from migration 001)
DROP TRIGGER IF EXISTS set_api_keys_updated_at ON public.api_keys;
CREATE TRIGGER set_api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Owners can do anything with their own rows (both personal AND voyage-scoped
-- rows are owned by the user who inserted them -- typically the voyage captain).
DROP POLICY IF EXISTS "api_keys_owner_all" ON public.api_keys;
CREATE POLICY "api_keys_owner_all" ON public.api_keys
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Voyage members can SELECT voyage-scoped keys (so the resolver can hand
-- them the captain's shared key at chat time). Captain-only write is enforced
-- in the route layer via isCaptain().
DROP POLICY IF EXISTS "api_keys_voyage_members_select" ON public.api_keys;
CREATE POLICY "api_keys_voyage_members_select" ON public.api_keys
  FOR SELECT
  USING (
    voyage_slug IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.voyage_members vm
      JOIN public.voyages v ON v.id = vm.voyage_id
      WHERE v.slug = public.api_keys.voyage_slug
        AND vm.user_id = auth.uid()
    )
  );

-- =============================================================================
-- Documentation
-- =============================================================================

COMMENT ON TABLE public.api_keys IS 'BYO multi-provider API keys (user + voyage scope, per-provider, per-purpose). Encrypted at rest with AES-256-GCM.';
COMMENT ON COLUMN public.api_keys.provider IS 'LLM provider: anthropic | openai | google | openrouter | custom';
COMMENT ON COLUMN public.api_keys.purpose IS 'conversation = primary chat model, reasoning = background agents';
COMMENT ON COLUMN public.api_keys.base_url IS 'Required for custom provider (OpenAI-compatible endpoint). Optional for openai (Azure/proxies).';
COMMENT ON COLUMN public.api_keys.voyage_slug IS 'NULL = personal key. Non-null = voyage captain''s shared key.';
