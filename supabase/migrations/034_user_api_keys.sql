-- =============================================================================
-- Migration 034: User BYO API Keys
-- =============================================================================
--
-- Store a user-supplied ("bring your own") provider API key on the profile,
-- encrypted at rest (AES-256-GCM, see lib/auth/keys.ts). The encrypted blob
-- never leaves the server in plaintext.
--
-- RLS: existing profiles policies (001_slice1_schema.sql) scope SELECT/UPDATE
-- to auth.uid() = id. That covers api_key_encrypted/api_provider (the settings
-- route validates before writing them under the user session). access_tier is
-- different — it's a server-granted entitlement and needs the guard below.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS api_provider TEXT DEFAULT 'anthropic',
  ADD COLUMN IF NOT EXISTS access_tier TEXT DEFAULT 'free';

-- The existing "Users can update own profile" policy is column-blind, so without
-- this guard a user could self-grant any tier via the anon client
-- (update profiles set access_tier='premium' where id = auth.uid()).
-- Pin access_tier on client UPDATEs: only the service role (auth.role() =
-- 'service_role', used by the admin client) may change it; a user-session update
-- silently keeps the prior value instead of erroring.
CREATE OR REPLACE FUNCTION public.guard_profile_access_tier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.access_tier IS DISTINCT FROM OLD.access_tier
     AND auth.role() <> 'service_role' THEN
    NEW.access_tier := OLD.access_tier;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS guard_profile_access_tier ON public.profiles;
CREATE TRIGGER guard_profile_access_tier
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_access_tier();
