// Module system types.
//
// A module is an atomic skill Voyager can hot-load at request time. A module
// declares zero-or-more tools (for the AI SDK), an optional skillPrompt (a
// guidance block injected into the system prompt when the module is active),
// and an optional `requires` block describing runtime constraints.
//
// Design choices locked by the Build-phase review of Slice 2:
//   * NO tier gating anywhere (no `tier` field).
//   * NO OAuth / external-auth fields (deferred).
//   * Mirror the existing tool pattern in lib/retrieval/tools.ts so module
//     tools drop straight into createVoyagerTools().

// ============================================================================
// Module tool declaration (manifest-side)
// ============================================================================

/**
 * A JSONSchema-flavoured input shape declared by a module for one of its
 * tools. We keep it deliberately loose -- modules arrive as JSONB so we do
 * not try to faithfully encode Zod schemas here. The loader is responsible
 * for translating this into something the AI SDK understands.
 *
 * Minimum fields mirror what `zod-to-json-schema` emits for a flat object
 * schema, which is enough for the first generation of modules.
 */
export interface ModuleToolInputSchema {
  type: 'object'
  properties?: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object'
    description?: string
    enum?: readonly (string | number)[]
    items?: { type: string }
  }>
  required?: readonly string[]
  additionalProperties?: boolean
}

/**
 * A module's declaration of a single tool. The `strategyHint` mirrors the
 * `ToolRegistration.strategyHint` in lib/retrieval/tools.ts so the hint
 * flows straight into `composeToolStrategy()`.
 *
 * The loader binds `handler` to each installed tool at request time. Modules
 * that ship with the app can provide a `handler` TypeScript function directly
 * (see lib/modules/seed.ts). Future "user-authored" modules (beyond Slice 2)
 * will need a different resolution mechanism -- out of scope for now.
 */
export interface ModuleToolDef {
  name: string
  description: string
  strategyHint: string
  inputSchema: ModuleToolInputSchema
  /**
   * Optional in the manifest shape (since JSONB can't carry a function).
   * Required at load time -- the loader matches the tool name back to a
   * handler from the in-process module seed registry.
   */
  handler?: (
    input: unknown,
    ctx: { userId: string; voyageSlug?: string; conversationId?: string }
  ) => Promise<string> | string
}

// ============================================================================
// Module manifest
// ============================================================================

export interface ModuleRequires {
  /** If true, this module can only be installed to voyage scope. */
  voyageScope?: boolean
}

/**
 * The full manifest carried in `modules.manifest` JSONB.
 *
 * No `tier` field. No `auth` / `connection` fields. Those are cut for Slice 2.
 */
export interface ModuleManifest {
  id: string
  name: string
  description: string
  version: string
  tools?: ModuleToolDef[]
  /** Guidance injected into the system prompt when this module is active. */
  skillPrompt?: string
  requires?: ModuleRequires
}

// ============================================================================
// Database row shapes
// ============================================================================

/**
 * Raw snake_case row in `public.modules`. Kept internal to the data layer.
 */
export interface ModuleRow {
  id: string
  name: string
  description: string
  manifest: ModuleManifest
  is_core: boolean
  scope: 'core' | 'user' | 'voyage'
  version: string
  created_at: string
  updated_at: string
}

/**
 * Safe-for-UI projection of a module row.
 */
export interface ModuleRecord {
  id: string
  name: string
  description: string
  manifest: ModuleManifest
  isCore: boolean
  scope: 'core' | 'user' | 'voyage'
  version: string
  createdAt: string
  updatedAt: string
}

/**
 * Raw snake_case row in `public.user_modules`.
 */
export interface UserModuleRow {
  id: string
  user_id: string
  module_id: string
  voyage_slug: string | null
  config: Record<string, unknown>
  installed_at: string
}

/**
 * Resolved view of an install -- user_modules row joined to its module row.
 * This is what the API returns and what the loader consumes.
 */
export interface InstalledModule {
  /** user_modules.id */
  installId: string
  moduleId: string
  voyageSlug: string | null
  config: Record<string, unknown>
  installedAt: string
  module: ModuleRecord
}

// ============================================================================
// Row mappers
// ============================================================================

export const toModuleRecord = (row: ModuleRow): ModuleRecord => ({
  id: row.id,
  name: row.name,
  description: row.description,
  manifest: row.manifest,
  isCore: row.is_core,
  scope: row.scope,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const toInstalledModule = (
  install: UserModuleRow,
  module: ModuleRow
): InstalledModule => ({
  installId: install.id,
  moduleId: install.module_id,
  voyageSlug: install.voyage_slug,
  config: install.config ?? {},
  installedAt: install.installed_at,
  module: toModuleRecord(module),
})
