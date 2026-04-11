// Module install / uninstall.
//
// Captain-only enforcement for voyage scope mirrors the pattern used by
// `api_keys` in Slice 1: owners can always manipulate their own rows via
// RLS; voyage-scope writes are gated here in the route layer.

import { getAdminClient } from '@/lib/supabase/admin'
import { isCaptain } from '@/lib/voyage'
import { log } from '@/lib/debug'
import { getModule } from './registry'
import {
  toInstalledModule,
  type InstalledModule,
  type ModuleRow,
  type UserModuleRow,
} from './types'

export type InstallResult =
  | { ok: true; installed: InstalledModule }
  | { ok: false; reason: string; status: number }

export type UninstallResult =
  | { ok: true; id: string }
  | { ok: false; reason: string; status: number }

export interface InstallInput {
  userId: string
  moduleId: string
  voyageSlug?: string | null
  config?: Record<string, unknown>
}

/**
 * Install a module to personal scope (voyageSlug null/omitted) or to a
 * voyage. Voyage installs require the caller to be captain of the voyage.
 */
export const installModule = async (
  input: InstallInput
): Promise<InstallResult> => {
  const { userId, moduleId } = input
  const voyageSlug = input.voyageSlug ?? null
  const config = input.config ?? {}

  // 1. Module must exist.
  const moduleRecord = await getModule(moduleId)
  if (!moduleRecord) {
    return {
      ok: false,
      reason: `Module "${moduleId}" not found in catalog`,
      status: 404,
    }
  }

  // 2. Respect requires.voyageScope.
  if (moduleRecord.manifest.requires?.voyageScope && !voyageSlug) {
    return {
      ok: false,
      reason: `Module "${moduleId}" can only be installed to a voyage`,
      status: 400,
    }
  }

  // 3. Voyage-scope install is captain-only.
  if (voyageSlug) {
    const captain = await isCaptain(voyageSlug, userId)
    if (!captain) {
      return {
        ok: false,
        reason: 'Only the voyage captain can install modules to this voyage',
        status: 403,
      }
    }
  }

  // 4. Upsert install row.
  const supabase = getAdminClient()
  const row: Record<string, unknown> = {
    user_id: userId,
    module_id: moduleId,
    voyage_slug: voyageSlug,
    config,
  }

  const conflictTarget = voyageSlug
    ? 'user_id,module_id,voyage_slug'
    : 'user_id,module_id'

  const { data, error } = await (supabase as any)
    .from('user_modules')
    .upsert(row, { onConflict: conflictTarget })
    .select('*')
    .single()

  if (error) {
    log.api('installModule upsert error', { error: error.message, moduleId }, 'error')
    return {
      ok: false,
      reason: `Failed to install module: ${error.message}`,
      status: 500,
    }
  }

  // 5. Join back to module row to return a hydrated InstalledModule.
  const { data: moduleRowRaw } = await (supabase as any)
    .from('modules')
    .select('*')
    .eq('id', moduleId)
    .single()

  if (!moduleRowRaw) {
    // Shouldn't happen -- we just fetched it above.
    return {
      ok: false,
      reason: 'Module disappeared mid-install',
      status: 500,
    }
  }

  return {
    ok: true,
    installed: toInstalledModule(
      data as UserModuleRow,
      moduleRowRaw as ModuleRow
    ),
  }
}

export interface UninstallInput {
  userId: string
  userModuleId: string
}

/**
 * Uninstall a specific user_modules row. Only the owner can uninstall.
 * Voyage installs are still owned by the captain who created them.
 */
export const uninstallModule = async (
  input: UninstallInput
): Promise<UninstallResult> => {
  const { userId, userModuleId } = input
  const supabase = getAdminClient()

  const { error, count } = await (supabase as any)
    .from('user_modules')
    .delete({ count: 'exact' })
    .eq('id', userModuleId)
    .eq('user_id', userId)

  if (error) {
    log.api('uninstallModule error', { error: error.message, userModuleId }, 'error')
    return {
      ok: false,
      reason: `Failed to uninstall module: ${error.message}`,
      status: 500,
    }
  }

  if (!count) {
    return {
      ok: false,
      reason: 'Install not found or not owned by caller',
      status: 404,
    }
  }

  return { ok: true, id: userModuleId }
}

/**
 * List every install belonging to a user, hydrated with the module row.
 * Includes both personal installs (voyage_slug NULL) and installs that the
 * user personally made against any voyage. Callers that want only the set
 * that is *active* for a given chat context should use lib/modules/loader.ts
 * instead -- this is the management-API view.
 */
export const listUserInstalls = async (
  userId: string
): Promise<InstalledModule[]> => {
  const supabase = getAdminClient()
  const { data, error } = await (supabase as any)
    .from('user_modules')
    .select('*, modules!inner(*)')
    .eq('user_id', userId)
    .order('installed_at', { ascending: false })

  if (error) {
    log.api('listUserInstalls error', { error: error.message }, 'error')
    return []
  }

  type JoinRow = UserModuleRow & { modules: ModuleRow }
  const rows = (data ?? []) as JoinRow[]
  return rows.map((r) => toInstalledModule(r, r.modules))
}
