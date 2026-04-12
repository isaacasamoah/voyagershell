// Voyager Forge — user-described module design.
//
// Slice 6A (reduced): a user describes what they want in natural language.
// Forge uses the user's BYO reasoning key (Slice 1) to generate a draft
// ModuleManifest + optional ConnectionTemplate for the proxy (Slice 6B).
//
// Critical review cuts from Isaac (2026-04-XX):
//   * NO OAuth, NO external-auth flow. AuthSpec.kind may only be 'none' in a
//     draft produced by Forge. The schema below constrains the model output.
//   * NO arbitrary HTTP. Only URL-template connections. The schema rejects
//     anything else.
//   * NO tier gates.
//   * NO auto-install. `designModule()` RETURNS a draft manifest; the caller
//     (and ultimately the user) must POST it to /api/modules to activate.
//
// Draft manifests are flagged with `status: 'draft'` so the install path can
// distinguish them from curated modules. They are NEVER written to the
// `modules` table by Forge itself.

import { generateObject } from 'ai'
import { z } from 'zod'
import { modelRouter } from '@/lib/models/router'
import { resolveApiKey, NO_KEY_ERROR } from '@/lib/keys'
import { log } from '@/lib/debug'
import type { ModuleManifest } from './types'
import type { ConnectionTemplate } from './proxy'

// ============================================================================
// Draft shape
// ============================================================================

/**
 * A draft manifest returned by Forge. The `status: 'draft'` discriminator is
 * what the install path keys off to refuse auto-installs or to render a
 * review step. Once reviewed, the caller hands the underlying manifest to
 * the existing `/api/modules` POST (which only knows about curated rows).
 *
 * `connectionTemplate` is optional — a Forge draft can be pure skillPrompt +
 * tools without any HTTP side (e.g. an instructive-only module).
 */
export interface DraftModuleManifest {
  status: 'draft'
  createdBy: string
  createdAt: string
  manifest: ModuleManifest
  connectionTemplate?: ConnectionTemplate
}

// ============================================================================
// Zod schema — constrains the model output
// ============================================================================
//
// This schema is deliberately narrower than `ModuleManifest` allows. It is
// the contract the model must produce. Fields that Forge is not permitted
// to touch (auth: api_key / oauth2, arbitrary method bodies, etc) are not
// representable at all.

const moduleToolInputSchema = z
  .object({
    type: z.literal('object'),
    properties: z
      .record(
        z.string(),
        z.object({
          type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
          description: z.string().optional(),
          enum: z.array(z.union([z.string(), z.number()])).optional(),
          items: z.object({ type: z.string() }).optional(),
        })
      )
      .optional(),
    required: z.array(z.string()).optional(),
    additionalProperties: z.boolean().optional(),
  })
  .strict()

const moduleToolDefSchema = z
  .object({
    name: z
      .string()
      .regex(/^[a-z][a-z0-9_]{1,63}$/, 'tool names must be snake_case'),
    description: z.string().min(1).max(500),
    strategyHint: z.string().min(1).max(300),
    inputSchema: moduleToolInputSchema,
  })
  .strict()

// AuthSpec at draft time: only 'none' is allowed. Any other shape would
// require the auth-storage recommendation to land first. See the report
// attached to Slice 6.
const draftAuthSpecSchema = z
  .object({
    kind: z.literal('none'),
  })
  .strict()

const rateLimitSchema = z
  .object({
    perMinute: z.number().int().min(1).max(600),
  })
  .strict()

const connectionTemplateSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]{1,64}$/),
    // baseUrl must be a plain https origin without a path template.
    baseUrl: z
      .string()
      .regex(
        /^https:\/\/[a-z0-9.-]+(?::\d+)?$/,
        'baseUrl must be an https origin with no path'
      ),
    // pathTemplate may contain {slot} placeholders.
    pathTemplate: z
      .string()
      .regex(
        /^\/[A-Za-z0-9/_{}.-]*$/,
        'pathTemplate must be a path with optional {slot} placeholders'
      ),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    rateLimit: rateLimitSchema.optional(),
    auth: draftAuthSpecSchema,
  })
  .strict()

const manifestSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9_-]{1,64}$/, 'id must be kebab/snake, 1-64 chars'),
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(500),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be semver'),
    tools: z.array(moduleToolDefSchema).max(8).optional(),
    skillPrompt: z.string().max(4000).optional(),
    requires: z
      .object({
        voyageScope: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

const draftOutputSchema = z
  .object({
    manifest: manifestSchema,
    connectionTemplate: connectionTemplateSchema.optional(),
  })
  .strict()

// ============================================================================
// System prompt
// ============================================================================

const SYSTEM_PROMPT = `You are Voyager Forge, a module designer.

A Voyager module is a DECLARATIVE JSON manifest describing an atomic skill
Voyager can hot-load at request time. Modules declare:
  - Optional tools (name, description, input schema) that the LLM can call.
  - An optional skillPrompt injected into the system prompt when the module
    is active.
  - An optional connection template describing an HTTP endpoint reachable
    through the Voyager proxy.

HARD CONSTRAINTS — DO NOT VIOLATE:
1. Modules are DECLARATIVE. You cannot emit executable code, scripts, or
   shell commands. Everything is JSON.
2. Connections are URL-template-only. The baseUrl must be a plain https
   origin. The pathTemplate may contain {slot} placeholders that map to
   well-defined tool input parameters. NEVER emit a baseUrl that already
   contains a path, query string, or template slot — those belong in the
   pathTemplate, not the baseUrl.
3. Authentication is limited to 'none' in the current Forge release. Do
   NOT design modules that require API keys or OAuth. If the user asks
   for an integration that requires auth (Slack, Gmail, Linear, etc.),
   refuse politely in the description field and still return a skeleton
   manifest with auth.kind = 'none' and no connectionTemplate.
4. No arbitrary HTTP escape hatch. If you cannot express a call as a
   URL template with typed parameters, do not include a connection.
5. Tools may only describe inputs — they cannot define side effects or
   code. Handlers are wired by the Voyager runtime at install time.
6. Rate limits default to 30 calls per minute per user. Only raise if
   the user explicitly requests it and the target API supports it.

The output you produce is a DRAFT. It is shown to the user for review
before any install. Be conservative, be correct, be small.

Return a single JSON object matching the schema you were given.`

// ============================================================================
// Public API
// ============================================================================

export interface DesignModuleInput {
  description: string
  userId: string
  voyageSlug?: string
  /** Optional extra free-text context (e.g. prior conversation turn). */
  context?: string
}

export type DesignModuleResult =
  | { ok: true; draft: DraftModuleManifest }
  | { ok: false; error: 'no_reasoning_key'; message: string }
  | { ok: false; error: 'invalid_description'; message: string }
  | { ok: false; error: 'generation_failed'; message: string }

/**
 * Design a draft module manifest from a natural-language description.
 *
 * Uses the user's BYO reasoning key (Slice 1). Returns a draft — does NOT
 * write to the modules table. The caller is responsible for surfacing the
 * draft to the user and calling POST /api/modules if the user approves.
 */
export const designModule = async (
  input: DesignModuleInput
): Promise<DesignModuleResult> => {
  const { description, userId, voyageSlug, context } = input

  if (!description || description.trim().length < 8) {
    return {
      ok: false,
      error: 'invalid_description',
      message:
        'Describe the module in at least a sentence — what it should do and what API, if any, it calls.',
    }
  }

  // Resolve the user's reasoning key. No env fallback.
  const resolvedKey = await resolveApiKey(userId, 'reasoning', { voyageSlug })
  if (!resolvedKey) {
    log.agent(
      'forge.designModule: no reasoning key',
      { userId: userId.slice(0, 8) },
      'warn'
    )
    return {
      ok: false,
      error: 'no_reasoning_key',
      message: NO_KEY_ERROR,
    }
  }

  const userPrompt = [
    `User's description of the desired module:`,
    description.trim(),
    context ? `\nExtra context from the conversation:\n${context.trim()}` : '',
    '',
    'Produce a draft manifest per the schema. Keep tools to the minimum',
    'needed to satisfy the description. Prefer skillPrompt-only modules when',
    'no external API is required.',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const { object } = await generateObject({
      model: modelRouter.select({
        task: 'chat',
        quality: 'best',
        resolvedKey,
      }),
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      schema: draftOutputSchema,
      maxOutputTokens: 2048,
    })

    const draft: DraftModuleManifest = {
      status: 'draft',
      createdBy: userId,
      createdAt: new Date().toISOString(),
      manifest: object.manifest as ModuleManifest,
      ...(object.connectionTemplate
        ? { connectionTemplate: object.connectionTemplate as ConnectionTemplate }
        : {}),
    }

    log.agent(
      'forge.designModule: draft generated',
      {
        userId: userId.slice(0, 8),
        moduleId: draft.manifest.id,
        hasConnection: Boolean(draft.connectionTemplate),
        toolCount: draft.manifest.tools?.length ?? 0,
      },
      'info'
    )

    return { ok: true, draft }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    log.agent(
      'forge.designModule: generation failed',
      { userId: userId.slice(0, 8), error: errMsg },
      'error'
    )
    return {
      ok: false,
      error: 'generation_failed',
      message: `Forge could not generate a draft manifest: ${errMsg}`,
    }
  }
}

// ============================================================================
// Draft cache — in-memory, 10-minute TTL, per-process
// ============================================================================

const draftCache = new Map<string, { draft: DraftModuleManifest; userId: string; expiresAt: number }>()

const DRAFT_TTL_MS = 10 * 60 * 1000

const sweepExpired = () => {
  const now = Date.now()
  Array.from(draftCache.entries()).forEach(([key, entry]) => {
    if (entry.expiresAt <= now) draftCache.delete(key)
  })
}

export const cacheDraft = (draft: DraftModuleManifest): string => {
  sweepExpired()
  const draftId = `draft-${draft.manifest.id}-${Date.now()}`
  draftCache.set(draftId, {
    draft,
    userId: draft.createdBy,
    expiresAt: Date.now() + DRAFT_TTL_MS,
  })
  return draftId
}

export const getDraft = (id: string, userId: string): DraftModuleManifest | null => {
  sweepExpired()
  const entry = draftCache.get(id)
  if (!entry || entry.userId !== userId) return null
  return entry.draft
}
