import { log } from '@/lib/debug'
import { sessionAuthority } from '@/lib/conversation/session-authority'
import { getAdminClient } from '@/lib/supabase/admin'

export interface RoomRoster {
  active: string[]
  invited: string[]
  aiPresent: boolean
}

interface EffectiveMemberRow { user_id: string | null }
interface ProfileRow { id: string; display_name: string | null; email: string | null }

export const getRoomRoster = async (
  sessionId: string,
  userId: string,
): Promise<RoomRoster> => {
  const admin = getAdminClient()
  const session = await sessionAuthority.getScope(sessionId, userId).catch(() => null)
  if (!session?.space_id) {
    return { active: [], invited: [], aiPresent: true }
  }

  const [{ data: space }, { data: members, error }, { data: activeMembers, error: activeError }] = await Promise.all([
    admin.from('spaces').select('ai_present').eq('id', session.space_id).maybeSingle(),
    admin.from('space_members')
      .select('user_id, state')
      .eq('space_id', session.space_id).in('state', ['active', 'invited']),
    admin.rpc('get_effective_space_member_ids', { p_space_id: session.space_id }),
  ])
  if (error || activeError) {
    log.api('getRoomRoster failed', { sessionId, error: error?.message ?? activeError?.message }, 'error')
    return { active: [], invited: [], aiPresent: true }
  }

  const rows = members ?? []
  const effectiveIds = new Set(((activeMembers as EffectiveMemberRow[] | null) ?? [])
    .map((member) => member.user_id).filter((id): id is string => Boolean(id)))
  if (!effectiveIds.has(session.user_id)) return { active: [], invited: [], aiPresent: true }

  const others = rows.filter((row) => row.user_id && row.user_id !== session.user_id)
  const { data: profiles } = others.length === 0
    ? { data: [] as ProfileRow[] }
    : await admin.from('profiles').select('id, display_name, email')
      .in('id', others.map((row) => row.user_id))
  const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
  const name = (row: (typeof rows)[number]) => {
    const profile = byId.get(row.user_id)
    return profile?.display_name ?? profile?.email ?? 'someone'
  }
  return {
    active: others.filter((row) => row.user_id && effectiveIds.has(row.user_id)).map(name),
    invited: others.filter((row) => row.state === 'invited').map(name),
    aiPresent: ((space as { ai_present: boolean | null } | null)?.ai_present) ?? true,
  }
}

/** The one honest line the model sees about the room, every turn. */
export const describeRoomForPrompt = (roster: RoomRoster): string => {
  if (roster.active.length === 0 && roster.invited.length === 0) {
    return '\n[Room state (authoritative): no other people are in this room and no invitations are pending. Describe the current room ONLY from this line — never infer current membership from conversation history.]'
  }
  const parts: string[] = []
  if (roster.active.length > 0) parts.push(`in the room: ${roster.active.join(', ')}`)
  if (roster.invited.length > 0) {
    parts.push(`invited but NOT joined (they cannot see these messages): ${roster.invited.join(', ')}`)
  }
  return `\n[Room state (authoritative): ${parts.join('; ')}. Describe the current room ONLY from this line — never infer current membership from conversation history.]`
}
