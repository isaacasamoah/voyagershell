// Principal-aware model resolution.
// The router's contract grows from select(requirements) to a per-person choice:
// if the user has an active brain connection, run on it; else fall back to the
// app's default (Anthropic) model. This is the model↔harness seam expressed as
// a single async call — nothing above lib/models needs to know which brain ran.

import type { LanguageModel } from 'ai'
import { modelRouter } from './router'
import type { ModelRequirements } from './router'
import { getUserCodexModel } from './connections'
import { CODEX_MODEL } from './codex'
import { log } from '@/lib/debug'

export interface ResolvedModel {
  model: LanguageModel
  /** Stable label for credit tracking / observability. */
  label: string
  /** True when a user brain connection (not the default provider) was used. */
  viaConnection: boolean
}

/**
 * Resolve the model to run for a given user + task, with provenance.
 * userId omitted (or unconnected, or connection error) → default provider.
 */
export const resolveUserModelWithMeta = async (
  requirements: ModelRequirements,
  userId?: string,
): Promise<ResolvedModel> => {
  const fallback = modelRouter.select(requirements)
  if (userId) {
    try {
      const codex = await getUserCodexModel(userId, fallback)
      if (codex) return { model: codex, label: CODEX_MODEL, viaConnection: true }
    } catch (err) {
      // Never let a brain-connection problem take down chat — degrade to default.
      log.api('resolveUserModel: codex path failed, using default', {}, 'warn')
    }
  }
  return { model: fallback, label: 'claude-sonnet', viaConnection: false }
}

/** Convenience: resolve just the model (background agents). */
export const resolveUserModel = async (
  requirements: ModelRequirements,
  userId?: string,
): Promise<LanguageModel> => (await resolveUserModelWithMeta(requirements, userId)).model
