// Module hot-loader.
//
// Per-request composition: query the caller's active installs (personal +
// voyage-scoped for the current voyage), resolve each install's tool
// declarations against the in-process SEED_HANDLERS, and produce a set of
// AI-SDK-ready tools that drops into `createVoyagerTools()`.
//
// Returns an empty set when there are no installs -- must be a zero-cost
// no-op in that case so users with no modules installed see no behavior
// change.
//
// Conflict rule: if a module declares a tool whose name collides with a
// core tool already exposed by createVoyagerTools(), the module tool is
// skipped and a warning is logged. Core wins -- this pins existing
// functionality. The caller passes the set of reserved core tool names.

import { tool } from 'ai'
import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/debug'
import { SEED_HANDLERS } from './seed'
import {
  toInstalledModule,
  type InstalledModule,
  type ModuleRow,
  type ModuleToolDef,
  type ModuleToolInputSchema,
  type UserModuleRow,
} from './types'
import type { ToolRegistration } from '@/lib/retrieval/tools'

export interface LoadModuleToolsInput {
  userId: string
  voyageSlug?: string
  conversationId?: string
  /**
   * Names of core tools already in use. Any module-declared tool whose name
   * collides with one of these is skipped.
   */
  reservedToolNames?: ReadonlySet<string>
}

export interface LoadedModuleTools {
  /** AI SDK tool map, keyed by tool name. */
  tools: Record<string, any>
  /** Registrations for composeToolStrategy(). */
  registrations: ToolRegistration[]
  /** Every install that contributed (or would have contributed) tools. */
  installs: InstalledModule[]
  /** Collected `manifest.skillPrompt` blocks for the active installs. */
  skillPrompts: Array<{ moduleId: string; moduleName: string; prompt: string }>
}

const EMPTY: LoadedModuleTools = {
  tools: {},
  registrations: [],
  installs: [],
  skillPrompts: [],
}

// ---------------------------------------------------------------------------
// JSON-schema-ish → Zod
// ---------------------------------------------------------------------------

const primitiveToZod = (
  type: 'string' | 'number' | 'boolean' | 'array' | 'object',
  prop: {
    type: string
    description?: string
    enum?: readonly (string | number)[]
    items?: { type: string }
  }
): z.ZodTypeAny => {
  switch (type) {
    case 'string': {
      if (prop.enum && prop.enum.length > 0) {
        const values = prop.enum.map((v) => String(v)) as [string, ...string[]]
        return z.enum(values)
      }
      return z.string()
    }
    case 'number':
      return z.number()
    case 'boolean':
      return z.boolean()
    case 'array': {
      const itemType = prop.items?.type ?? 'string'
      const inner = primitiveToZod(
        (itemType as 'string' | 'number' | 'boolean' | 'array' | 'object') ?? 'string',
        { type: itemType }
      )
      return z.array(inner)
    }
    case 'object':
      return z.record(z.string(), z.unknown())
    default:
      return z.unknown()
  }
}

const moduleSchemaToZod = (schema: ModuleToolInputSchema): z.ZodObject<any> => {
  const shape: Record<string, z.ZodTypeAny> = {}
  const required = new Set(schema.required ?? [])
  const props = schema.properties ?? {}
  for (const [name, prop] of Object.entries(props)) {
    let zType = primitiveToZod(prop.type, prop)
    if (prop.description) zType = zType.describe(prop.description)
    if (!required.has(name)) zType = zType.optional()
    shape[name] = zType
  }
  return z.object(shape)
}

// ---------------------------------------------------------------------------
// Tool binding
// ---------------------------------------------------------------------------

const bindModuleTool = (
  moduleId: string,
  def: ModuleToolDef,
  ctx: { userId: string; voyageSlug?: string; conversationId?: string }
): any | null => {
  // Resolve handler. Seed-shipped modules register their handler in
  // SEED_HANDLERS because JSONB cannot carry a function across DB rows.
  const handler =
    def.handler ??
    SEED_HANDLERS[moduleId]?.[def.name] ??
    null

  if (!handler) {
    log.api(
      'Module tool missing handler -- skipping',
      { moduleId, tool: def.name },
      'warn'
    )
    return null
  }

  let schema: z.ZodObject<any>
  try {
    schema = moduleSchemaToZod(def.inputSchema)
  } catch (err) {
    log.api(
      'Module tool schema parse failed -- skipping',
      { moduleId, tool: def.name, error: String(err) },
      'error'
    )
    return null
  }

  return tool({
    description: def.description,
    inputSchema: schema,
    execute: async (input) => {
      try {
        const result = await handler(input, ctx)
        return typeof result === 'string' ? result : JSON.stringify(result)
      } catch (err) {
        log.api(
          'Module tool execute threw',
          { moduleId, tool: def.name, error: String(err) },
          'error'
        )
        return `Tool "${def.name}" failed: ${String(err)}`
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Load installed modules for this request
// ---------------------------------------------------------------------------

const fetchActiveInstalls = async (
  userId: string,
  voyageSlug?: string
): Promise<InstalledModule[]> => {
  const supabase = getAdminClient()

  // Build the scope filter: personal installs (voyage_slug IS NULL) always,
  // plus voyage-scoped installs for the current voyage if in one. The
  // generated Supabase types don't know about these tables -- use `any`.
  let query = (supabase as any)
    .from('user_modules')
    .select('*, modules!inner(*)')
    .eq('user_id', userId)

  if (voyageSlug) {
    query = query.or(`voyage_slug.is.null,voyage_slug.eq.${voyageSlug}`)
  } else {
    query = query.is('voyage_slug', null)
  }

  const { data, error } = await query
  if (error) {
    log.api(
      'fetchActiveInstalls error',
      { error: error.message, userId, voyageSlug },
      'error'
    )
    return []
  }

  type JoinRow = UserModuleRow & { modules: ModuleRow }
  const rows = (data ?? []) as JoinRow[]
  return rows.map((r) => toInstalledModule(r, r.modules))
}

/**
 * Load module tools for a given chat request. Returns an empty set (no DB
 * round-trip cost beyond the single query) when the user has nothing
 * installed.
 */
export const loadModuleTools = async (
  input: LoadModuleToolsInput
): Promise<LoadedModuleTools> => {
  const { userId, voyageSlug, conversationId, reservedToolNames } = input
  const reserved = reservedToolNames ?? new Set<string>()

  const installs = await fetchActiveInstalls(userId, voyageSlug)
  if (installs.length === 0) return EMPTY

  const tools: Record<string, any> = {}
  const registrations: ToolRegistration[] = []
  const skillPrompts: LoadedModuleTools['skillPrompts'] = []
  const claimedNames = new Set<string>(reserved)

  for (const install of installs) {
    const manifest = install.module.manifest
    if (manifest.skillPrompt && manifest.skillPrompt.trim().length > 0) {
      skillPrompts.push({
        moduleId: manifest.id,
        moduleName: manifest.name,
        prompt: manifest.skillPrompt,
      })
    }

    for (const def of manifest.tools ?? []) {
      // Collision with core (or with an earlier module) → skip.
      if (claimedNames.has(def.name)) {
        log.api(
          'Module tool name collides with existing tool -- skipping (core wins)',
          { moduleId: manifest.id, tool: def.name },
          'warn'
        )
        continue
      }

      const bound = bindModuleTool(manifest.id, def, {
        userId,
        voyageSlug,
        conversationId,
      })
      if (!bound) continue

      tools[def.name] = bound
      registrations.push({
        name: def.name,
        tool: bound,
        strategyHint: def.strategyHint,
      })
      claimedNames.add(def.name)
    }
  }

  return { tools, registrations, installs, skillPrompts }
}
