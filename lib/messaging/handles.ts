// The handles data layer — typed reads/writes over the ONE addressing namespace.
// address.ts is the pure resolver; THIS is where the real handle set it resolves
// against comes from. Runtime reads the handles table, never model-guesses it.

import { getAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/debug'
import { normalizeUsername } from '@/lib/voyage/username'
import { pickOwnVoyagerHandle, voyagerCustomName, capitalizeName, type VoyagerHandle } from './address'

export type HandleKind = 'human' | 'voyager'

export type HandleResult =
  | { ok: true; handle: string }
  | { ok: false; error: string }

interface HandleOwnerRow {
  handle: string
  owner_user_id: string
}

interface MemberProfileRow {
  id: string
  username: string | null
  display_name: string | null
}

const from = (table: string) =>
  (getAdminClient() as unknown as { from: (t: string) => any }).from(table)

// ── Pure assembly: member ids + fetched rows → the room's VoyagerHandle set ───
// isOwn is the trust boundary — true ONLY for the caller's own voyager.
export const toRoomVoyagerHandles = (
  memberIds: string[],
  callerId: string,
  handleRows: HandleOwnerRow[],
  profiles: MemberProfileRow[],
): VoyagerHandle[] => {
  const handleByOwner = new Map(handleRows.map((r) => [r.owner_user_id, r.handle]))
  const profileById = new Map(profiles.map((p) => [p.id, p]))
  const out: VoyagerHandle[] = []
  for (const id of memberIds) {
    const profile = profileById.get(id)
    const rowHandle = handleByOwner.get(id)
    const handle = pickOwnVoyagerHandle(rowHandle, profile?.username)
    if (!handle) continue
    // The custom name (claimed handle ≠ derived default), title-cased for display.
    // Null when unnamed — the fanned reply then stays the flat "Voyager".
    const custom = voyagerCustomName(rowHandle, profile?.username)
    out.push({
      handle,
      ownerName: profile?.display_name ?? profile?.username ?? 'someone',
      isOwn: id === callerId,
      ownerUserId: id, // the identity of record for a cross-owner summon (§6.5)
      name: custom ? capitalizeName(custom) : null,
    })
  }
  return out
}

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

// Every room member's voyager handle, own included, each isOwn-tagged for the
// caller. Solo (no space) still returns the caller's own so `@own` resolves.
export const listRoomVoyagerHandles = async (
  sessionId: string,
  userId: string,
): Promise<VoyagerHandle[]> => {
  const memberIds = await getRoomMemberIds(sessionId, userId)
  if (memberIds.length === 0) return []
  const [{ data: handleRows }, { data: profileRows }] = await Promise.all([
    from('handles').select('handle, owner_user_id').in('owner_user_id', memberIds).eq('kind', 'voyager'),
    from('profiles').select('id, username, display_name').in('id', memberIds),
  ])
  return toRoomVoyagerHandles(
    memberIds,
    userId,
    (handleRows as HandleOwnerRow[] | null) ?? [],
    (profileRows as MemberProfileRow[] | null) ?? [],
  )
}

const getRoomMemberIds = async (sessionId: string, callerId: string): Promise<string[]> => {
  const { data: session } = await from('sessions').select('space_id').eq('id', sessionId).maybeSingle()
  const spaceId = (session as { space_id: string | null } | null)?.space_id
  if (!spaceId) return [callerId]
  const { data: members } = await from('space_members')
    .select('user_id')
    .eq('space_id', spaceId)
    .eq('state', 'active')
  const ids = ((members as { user_id: string | null }[] | null) ?? [])
    .map((m) => m.user_id)
    .filter((id): id is string => Boolean(id))
  return Array.from(new Set([callerId, ...ids]))
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
