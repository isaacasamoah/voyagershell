// The handles data layer — typed reads/writes over the ONE addressing namespace.
// address.ts is the pure resolver; THIS is where the real handle set it resolves
// against comes from. Runtime reads the handles table, never model-guesses it.

import { getAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/debug'
import { normalizeUsername } from '@/lib/voyage/username'
import { deriveVoyagerHandle, type VoyagerHandle } from './address'

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

// ── Pure selection: a claimed row wins, else the derived default, else '' ─────
// deriveVoyagerHandle() is the twin of the migration's `|| '.voyager'` backfill,
// so the default handle can never drift between backfill and runtime.
export const pickOwnVoyagerHandle = (
  rowHandle: string | null | undefined,
  username: string | null | undefined,
): string => {
  if (rowHandle) return rowHandle.trim().toLowerCase()
  if (username) return deriveVoyagerHandle(username)
  return ''
}

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
    const handle = pickOwnVoyagerHandle(handleByOwner.get(id), profile?.username)
    if (!handle) continue
    out.push({
      handle,
      ownerName: profile?.display_name ?? profile?.username ?? 'someone',
      isOwn: id === callerId,
    })
  }
  return out
}

// The caller's own voyager handle: claimed name, else derived `<username>.voyager`,
// else '' (no username yet — the `voyager` alias still carries the aside).
export const getOwnVoyagerHandle = async (userId: string): Promise<string> => {
  const [{ data: row }, { data: profile }] = await Promise.all([
    from('handles').select('handle').eq('owner_user_id', userId).eq('kind', 'voyager').maybeSingle(),
    from('profiles').select('username').eq('id', userId).maybeSingle(),
  ])
  return pickOwnVoyagerHandle(
    (row as { handle: string } | null)?.handle,
    (profile as { username: string | null } | null)?.username,
  )
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
