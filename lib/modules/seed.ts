// Module seed definitions -- the TypeScript source of truth that mirrors
// whatever rows the DB migration (034_modules.sql) inserts into `modules`.
//
// Judgment call for Slice 2:
//   The spec lists `web-search` and `remember-knowledge` as the canonical
//   core modules to seed. Both already exist as first-class tools in
//   lib/retrieval/tools.ts (see the `web_search` and `remember_knowledge`
//   entries in createVoyagerTools). Seeding placeholder modules for them
//   would be duplicative -- and because the loader in lib/modules/loader.ts
//   skips any module-declared tool whose name already exists in the core
//   set, those seeds would be skipped at load time anyway.
//
//   Therefore: the seed list is empty. This file exists so that when the
//   first real add-on module (beyond what core already exposes) lands, the
//   manifest lives here, the migration embeds the same JSON, and the loader
//   can resolve the handler by name from SEED_HANDLERS.
//
// Shape: each seed entry is `{ manifest, handlers }` where `handlers` maps
// a tool name declared in `manifest.tools` to an in-process async function.
// The loader composes the manifest's declarative tool shape with the handler
// at request time.

import type {
  ModuleManifest,
  ModuleToolDef,
} from './types'

export type SeedToolHandler = NonNullable<ModuleToolDef['handler']>

export interface SeedModule {
  manifest: ModuleManifest
  handlers: Record<string, SeedToolHandler>
}

/**
 * In-process registry of shipped modules. Empty by design for Slice 2 -- see
 * the header comment. Future modules append here and their manifest JSON is
 * ALSO written into 034_modules.sql (or a follow-up migration) so the DB
 * catalog matches.
 */
export const SEED_MODULES: SeedModule[] = []

/**
 * Flat { [moduleId]: { [toolName]: handler } } for fast lookup from the loader.
 */
export const SEED_HANDLERS: Record<string, Record<string, SeedToolHandler>> =
  Object.fromEntries(SEED_MODULES.map((m) => [m.manifest.id, m.handlers]))
