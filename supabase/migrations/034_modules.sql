-- =============================================================================
-- Migration 034: Module System Foundation
-- =============================================================================
--
-- Atomic skills that extend Voyager, installable per-user or per-voyage and
-- hot-loaded per-request. This is the DB foundation for Slice 2 of the
-- Voyager Launch spec.
--
-- Tables:
--   * modules       -- curated module catalog (tool definitions + skill prompts)
--   * user_modules  -- per-user / per-voyage installations
--
-- Scope rules (mirrors api_keys from 033):
--   * Personal install:  voyage_slug IS NULL
--   * Voyage install:    voyage_slug = '<slug>'
--
-- Notes vs. the original spec:
--   * NO `tier` column. Single-tier phase; tier gating is cut across the board.
--   * NO OAuth / external-auth fields. Module external-auth is deferred.
--   * Core tools (web_search, remember_knowledge, etc.) are already native in
--     lib/retrieval/tools.ts. This migration does NOT seed placeholder modules
--     for them -- it just builds the infrastructure. See seed.ts for details.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- modules -- curated catalog
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.modules (
  id TEXT PRIMARY KEY,

  -- Display
  name TEXT NOT NULL,
  description TEXT NOT NULL,

  -- The full ModuleManifest (see lib/modules/types.ts)
  manifest JSONB NOT NULL,

  -- Catalog metadata
  is_core BOOLEAN NOT NULL DEFAULT false,
  scope TEXT NOT NULL DEFAULT 'user' CHECK (scope IN ('core', 'user', 'voyage')),
  version TEXT NOT NULL DEFAULT '1.0.0',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_modules_updated_at ON public.modules;
CREATE TRIGGER set_modules_updated_at
  BEFORE UPDATE ON public.modules
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- user_modules -- installations
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,

  -- NULL = personal install, non-null = voyage-scoped install
  voyage_slug TEXT REFERENCES public.voyages(slug) ON DELETE CASCADE,

  -- Per-install configuration (module-defined shape)
  config JSONB NOT NULL DEFAULT '{}'::jsonb,

  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique indexes -- NULLs in regular UNIQUE are distinct in Postgres,
-- so we need separate indexes for personal vs. voyage-scoped installs.
CREATE UNIQUE INDEX IF NOT EXISTS user_modules_personal_unique
  ON public.user_modules (user_id, module_id)
  WHERE voyage_slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_modules_voyage_unique
  ON public.user_modules (user_id, module_id, voyage_slug)
  WHERE voyage_slug IS NOT NULL;

-- Hot-path lookup for loadModuleTools(userId, voyageSlug).
CREATE INDEX IF NOT EXISTS idx_user_modules_user_voyage
  ON public.user_modules (user_id, voyage_slug);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- -----------------------------------------------------------------------------
-- modules -- readable by any authenticated user (curated catalog, no secrets).
-- Writes happen out-of-band (migrations / admin) so no INSERT/UPDATE/DELETE
-- policies for authenticated users.
-- -----------------------------------------------------------------------------

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "modules_authenticated_select" ON public.modules;
CREATE POLICY "modules_authenticated_select" ON public.modules
  FOR SELECT
  TO authenticated
  USING (true);

-- -----------------------------------------------------------------------------
-- user_modules -- owner controls personal rows; voyage members can read
-- voyage-scoped rows so the loader can see them. Captain-only writes on
-- voyage scope are enforced in the route layer via isCaptain() (mirrors
-- the api_keys pattern from 033).
-- -----------------------------------------------------------------------------

ALTER TABLE public.user_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_modules_owner_all" ON public.user_modules;
CREATE POLICY "user_modules_owner_all" ON public.user_modules
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_modules_voyage_members_select" ON public.user_modules;
CREATE POLICY "user_modules_voyage_members_select" ON public.user_modules
  FOR SELECT
  USING (
    voyage_slug IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.voyage_members vm
      JOIN public.voyages v ON v.id = vm.voyage_id
      WHERE v.slug = public.user_modules.voyage_slug
        AND vm.user_id = auth.uid()
    )
  );

-- =============================================================================
-- Core module seed
-- =============================================================================
--
-- Judgment call: the spec lists `web-search` and `remember-knowledge` as the
-- canonical "core modules" to seed here. Both already exist as first-class
-- tools in lib/retrieval/tools.ts (see the `web_search` and `remember_knowledge`
-- entries in createVoyagerTools). Seeding placeholder module rows for them
-- would be duplicative -- and because the loader in lib/modules/loader.ts
-- skips any module-declared tool whose name already exists in the core set,
-- those seeds would be skipped at load time anyway.
--
-- Therefore: no core modules seeded in this migration. The module-system
-- infrastructure (catalog table, install table, RLS, hot-loader) ships empty
-- and is ready to receive real add-on modules when we have one that is NOT
-- already a native core tool. lib/modules/seed.ts documents the same choice
-- so the DB and the code stay in sync.
-- =============================================================================

-- =============================================================================
-- Documentation
-- =============================================================================

COMMENT ON TABLE public.modules IS
  'Curated module catalog. Each row carries a ModuleManifest (JSONB) that describes tools and skillPrompt fragments. No tier gating, no external-auth fields -- those are deferred.';
COMMENT ON COLUMN public.modules.manifest IS
  'ModuleManifest JSON: { id, name, description, version, tools?, skillPrompt?, requires? }';
COMMENT ON COLUMN public.modules.scope IS
  'Installation scope hint: core = always on, user = installable personally, voyage = installable on voyages.';

COMMENT ON TABLE public.user_modules IS
  'Module installations. NULL voyage_slug = personal install; non-null = voyage-scoped install. Captain-only writes on voyage scope enforced in the route layer.';
COMMENT ON COLUMN public.user_modules.voyage_slug IS
  'NULL = personal install. Non-null = voyage-scoped install (captain-only write).';
COMMENT ON COLUMN public.user_modules.config IS
  'Per-install configuration, shape defined by the module manifest.';
