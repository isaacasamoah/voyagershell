// The handles data layer — typed reads/writes over the ONE addressing namespace.
// address.ts is the pure resolver; THIS is where the real handle set it resolves
// against comes from. Runtime reads the handles table, never model-guesses it.

import { getAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/debug'
import { normalizeUsername } from '@/lib/voyage/username'
import { pickOwnVoyagerHandle, voyagerCustomName } from './address'

export type HandleKind = 'human' | 'voyager'

export type HandleResult =
  | { ok: true; handle: string }
  | { ok: false; error: string }

const from = (table: string) =>
  (getAdminClient() as unknown as { from: (t: string) => any }).from(table)

// The caller's own voyager identity: the addressing `handle` (claimed name, else
// derived `<username>.voyager`, else '') plus the custom `name` for the prompt.
//
// A CUSTOM name is a claimed row whose handle DIFFERS from the derived default —
// provenance by value, not by suffix, so a user who names their voyager
// `nova.voyager` (username `alice`, derived `alice.voyager`) is still recognised
// as named. The old `.endsWith('.voyager')` heuristic suppressed exactly that.
//
// Fails CLOSED on a handles-read error: it must never INVENT a derived handle
// from an errored read (that would silently reclassify an aside). A null row
// with NO error is a genuinely unnamed voyager, which legitimately derives.
export const getOwnVoyagerIdentity = async (
  userId: string,
): Promise<{ handle: string; name: string | null }> => {
  const [{ data: row, error: rowError }, { data: profile }] = await Promise.all([
    from('handles').select('handle').eq('owner_user_id', userId).eq('kind', 'voyager').maybeSingle(),
    from('profiles').select('username').eq('id', userId).maybeSingle(),
  ])
  if (rowError) return { handle: '', name: null }
  const rowHandle = (row as { handle: string } | null)?.handle ?? null
  const username = (profile as { username: string | null } | null)?.username ?? null
  return {
    handle: pickOwnVoyagerHandle(rowHandle, username),
    name: voyagerCustomName(rowHandle, username),
  }
}


// Claim (or rename in place) the caller's single handle of a kind. The DB's
// case-insensitive unique index is the uniqueness authority — a 23505 means the
// handle is already taken across the whole namespace.
export const claimHandle = async (
  userId: string,
  handle: string,
  kind: HandleKind,
): Promise<HandleResult> => {
  const norm = handle.trim().toLowerCase()
  if (!norm) return { ok: false, error: 'That handle is empty — try another.' }

  const { data: existing } = await from('handles')
    .select('handle')
    .eq('owner_user_id', userId)
    .eq('kind', kind)
    .maybeSingle()
  const current = (existing as { handle: string } | null)?.handle
  if (current === norm) return { ok: true, handle: norm }

  const { error } = current
    ? await from('handles').update({ handle: norm }).eq('owner_user_id', userId).eq('kind', kind)
    : await from('handles').insert({ handle: norm, kind, owner_user_id: userId })

  if (error?.code === '23505') return { ok: false, error: `"${norm}" is taken — try another.` }
  if (error) {
    log.api('claimHandle failed', { userId, kind, error: error.message }, 'error')
    return { ok: false, error: 'Could not claim that handle. Try again?' }
  }
  return { ok: true, handle: norm }
}

// Name (or rename) the caller's voyager, riding the same set_username-style
// validation — pattern + reserved-word check — before it hits the namespace.
export const renameVoyagerHandle = async (userId: string, handle: string): Promise<HandleResult> => {
  const normalized = normalizeUsername(handle)
  if (!normalized.ok) return { ok: false, error: normalized.error }
  return claimHandle(userId, normalized.username, 'voyager')
}
