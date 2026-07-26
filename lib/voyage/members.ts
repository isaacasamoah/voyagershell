import { log } from '@/lib/debug'
import { sessionAuthority } from '@/lib/conversation/session-authority'
import { getAdminClient } from '@/lib/supabase/admin'
import { transformMember, transformMembership } from './transforms'
import type {
  UserVoyageRow,
  VoyageMember,
  VoyageMemberRow,
  VoyageMembership,
  VoyageRole,
} from './types'

export const getLastActiveVoyageSlug = async (userId: string): Promise<string | null> => {
  try {
    return await sessionAuthority.getLastActiveVoyageSlug(userId)
  } catch (error) {
    log.voyage('getLastActiveVoyageSlug error', { error: String(error), userId }, 'error')
    return null
  }
}

export const getUserVoyages = async (userId: string): Promise<VoyageMembership[]> => {
  log.voyage('Getting voyages for user', { userId })
  try {
    const { data, error } = await getAdminClient().rpc('get_user_voyages', { p_user_id: userId })
    if (error) {
      log.voyage('getUserVoyages error', { error: error.message, userId }, 'error')
      return []
    }
    return Array.isArray(data) ? (data as UserVoyageRow[]).map(transformMembership) : []
  } catch (error) {
    log.voyage('getUserVoyages error', { error: String(error), userId }, 'error')
    return []
  }
}

export const getUserRole = async (
  voyageSlug: string,
  userId: string,
): Promise<VoyageRole | null> => {
  try {
    const { data, error } = await getAdminClient().rpc('get_voyage_role', {
      p_voyage_slug: voyageSlug,
      p_user_id: userId,
    })
    if (error) {
      log.voyage('getUserRole error', { error: error.message, voyageSlug, userId }, 'error')
      return null
    }
    return data as VoyageRole | null
  } catch (error) {
    log.voyage('getUserRole error', { error: String(error), voyageSlug, userId }, 'error')
    return null
  }
}

export const isCaptain = async (voyageSlug: string, userId: string): Promise<boolean> => {
  try {
    const { data, error } = await getAdminClient().rpc('is_voyage_captain', {
      p_voyage_slug: voyageSlug,
      p_user_id: userId,
    })
    if (error) {
      log.voyage('isCaptain error', { error: error.message, voyageSlug, userId }, 'error')
      return false
    }
    return data === true
  } catch (error) {
    log.voyage('isCaptain error', { error: String(error), voyageSlug, userId }, 'error')
    return false
  }
}

export const resolveMemberByName = (
  members: Array<{
    userId: string
    displayName?: string | null
    username?: string | null
    nickname?: string | null
    email?: string | null
  }>,
  name: string,
): { userId: string; displayName: string } | null => {
  const lower = name.toLowerCase().trim()
  const usernameMatches = members.filter((member) => member.username?.toLowerCase() === lower)
  if (usernameMatches.length === 1) {
    const match = usernameMatches[0]
    return { userId: match.userId, displayName: match.displayName ?? match.email ?? name }
  }
  const matches = members.filter((member) => {
    const display = member.displayName?.toLowerCase() ?? ''
    const nickname = member.nickname?.toLowerCase() ?? ''
    return display === lower || display.startsWith(`${lower} `)
      || display.split(' ').some((part) => part === lower) || nickname === lower
  })
  if (matches.length !== 1) return null
  return {
    userId: matches[0].userId,
    displayName: matches[0].displayName ?? matches[0].email ?? name,
  }
}

export const getVoyageMembers = async (voyageId: string): Promise<VoyageMember[]> => {
  log.voyage('Getting members for voyage', { voyageId })
  try {
    const { data, error } = await getAdminClient().from('voyage_members').select(`
      *, profiles:user_id (email, display_name, username)
    `).eq('voyage_id', voyageId).eq('state', 'active').order('joined_at', { ascending: true })
    if (error) {
      log.voyage('getVoyageMembers error', { error: error.message, voyageId }, 'error')
      return []
    }
    return (data as Array<VoyageMemberRow & {
      profiles: { email: string; display_name: string; username: string | null }
    }>).map(transformMember)
  } catch (error) {
    log.voyage('getVoyageMembers error', { error: String(error), voyageId }, 'error')
    return []
  }
}

export const regenerateInviteCode = async (
  voyageId: string,
  userId: string,
): Promise<string | null> => {
  log.voyage('Regenerating invite code', { voyageId })
  try {
    const { data, error } = await getAdminClient().rpc('regenerate_voyage_invite', {
      p_voyage_id: voyageId,
      p_user_id: userId,
    })
    if (error) {
      log.voyage('regenerateInviteCode error', { error: error.message, voyageId }, 'error')
      return null
    }
    return data as string | null
  } catch (error) {
    log.voyage('regenerateInviteCode error', { error: String(error), voyageId }, 'error')
    return null
  }
}
