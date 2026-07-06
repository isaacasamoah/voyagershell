-- =============================================================================
-- Migration 035: Household brain share — the voyage IS the household
-- =============================================================================
--
-- A brain connection can be shared to ONE voyage. Members of that voyage whose
-- chats find no connection of their own resolve to the shared one. No new
-- household system: the voyage primitive already models "us".
--
-- Deliberate constraints:
--   * One voyage per connection (single household — not a distribution list).
--   * The credential stays encrypted under the OWNER's row; members never see
--     tokens, they only ride resolution. Revoke = NULL the column.
--   * ToS posture (owner's call, eyes open): within-household sharing of a
--     personal subscription — personal use, no resale, structurally capped at
--     one voyage by this schema.
-- =============================================================================

DO $$ BEGIN
  ALTER TABLE public.brain_connections
    ADD COLUMN shared_voyage_slug TEXT REFERENCES public.voyages(slug) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_brain_connections_shared_voyage
  ON public.brain_connections (shared_voyage_slug)
  WHERE shared_voyage_slug IS NOT NULL;

COMMENT ON COLUMN public.brain_connections.shared_voyage_slug IS
  'Household share: members of this voyage resolve to this connection when they have none of their own. One voyage max — the voyage is the household.';
