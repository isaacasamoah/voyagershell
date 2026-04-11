-- =============================================================================
-- Migration 036: Conversation Branches (Slice 5)
-- =============================================================================
--
-- Extends public.sessions with branch metadata so a single sessions row can
-- represent any of:
--   * a primary conversation      (branch_type IS NULL)
--   * a person branch             (branch_type = 'person', metadata.kind = 'person')
--   * a channel branch            (branch_type = 'channel', metadata.kind = 'channel')
--
-- 'tell' is listed in the CHECK for symmetry, but per the Slice 5 design we
-- do NOT create tell branches -- tell mode is fire-and-forget on the sender's
-- main thread via resolve_mention's existing one-off event path. Keeping the
-- enum value leaves the door open without requiring a later CHECK migration.
--
-- Notes
--   * Additive columns only. No RLS policy changes (sessions RLS from 001
--     is owner-based; channel reads cross-user use the admin client in code).
--   * voyage_slug is added alongside the existing voyage_id for branches
--     because branch code paths use slug-based context. Personal branches
--     leave voyage_slug NULL.
--   * Uses a DO block for each ADD COLUMN so re-runs soft-fail on duplicate
--     column (matching the defensive style used elsewhere in this repo).
-- =============================================================================

DO $$ BEGIN
  ALTER TABLE public.sessions
    ADD COLUMN parent_session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.sessions
    ADD COLUMN branch_type TEXT CHECK (branch_type IN ('tell', 'person', 'channel'));
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.sessions
    ADD COLUMN voyage_slug TEXT REFERENCES public.voyages(slug) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.sessions
    ADD COLUMN branch_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_sessions_parent
  ON public.sessions(parent_session_id)
  WHERE parent_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_voyage_branch
  ON public.sessions(voyage_slug, branch_type)
  WHERE voyage_slug IS NOT NULL AND branch_type IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Documentation
-- -----------------------------------------------------------------------------

COMMENT ON COLUMN public.sessions.parent_session_id IS
  'Slice 5: if set, this session is a branch of parent_session_id. ON DELETE SET NULL keeps branches alive if the parent is removed.';
COMMENT ON COLUMN public.sessions.branch_type IS
  'Slice 5: NULL for primary conversations. ''person'' = @mention branch. ''channel'' = #channel branch. ''tell'' reserved but unused (tell mode is fire-and-forget, no branch).';
COMMENT ON COLUMN public.sessions.voyage_slug IS
  'Slice 5: voyage scope for branches. Channel branches REQUIRE this; person branches inherit it from the parent session.';
COMMENT ON COLUMN public.sessions.branch_metadata IS
  'Slice 5: JSON metadata for branches. person → { kind: ''person'', participantUserIds: string[] }. channel → { kind: ''channel'', channelName: string }.';
