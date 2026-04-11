// Module registry -- read-side CRUD on the `modules` catalog.
//
// Writes to the catalog happen out-of-band (migrations / admin tools), so
// this file only exposes reads. Installs live in `user_modules` and are
// managed by install.ts.
//
// NO tier filtering. Single-tier phase.

import { getAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/debug'
import {
  toModuleRecord,
  type ModuleRecord,
  type ModuleRow,
} from './types'

/**
 * List every module in the catalog, newest first.
 */
export const listModules = async (): Promise<ModuleRecord[]> => {
  const supabase = getAdminClient()
  // `modules` not yet in generated Supabase types -- cast through any.
  const { data, error } = await (supabase as any)
    .from('modules')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    log.api('listModules error', { error: error.message }, 'error')
    return []
  }

  const rows = (data ?? []) as ModuleRow[]
  return rows.map(toModuleRecord)
}

/**
 * Fetch a single module by id. Returns null if not found.
 */
export const getModule = async (id: string): Promise<ModuleRecord | null> => {
  const supabase = getAdminClient()
  const { data, error } = await (supabase as any)
    .from('modules')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    log.api('getModule error', { error: error.message, id }, 'error')
    return null
  }

  if (!data) return null
  return toModuleRecord(data as ModuleRow)
}
