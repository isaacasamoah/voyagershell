-- =============================================================================
-- Migration 038: drop ghost tables (clean-cut review 2026-07-08)
-- =============================================================================
-- Three tables with zero source-of-truth:
--   modules, user_modules — created out-of-band (Management API), never
--     captured as a migration, never wired to code/types. Abandoned.
--   user_memory_archive — intentional archive (012) but EMPTY (0 rows); its
--     data lives in knowledge_events. The live HNSW index is pure overhead.
-- None are referenced by any code path (verified: zero grep hits in lib/app).
-- CASCADE handles their RLS policies + indexes.
-- =============================================================================

DROP TABLE IF EXISTS public.user_modules CASCADE;
DROP TABLE IF EXISTS public.modules CASCADE;
DROP TABLE IF EXISTS public.user_memory_archive CASCADE;
