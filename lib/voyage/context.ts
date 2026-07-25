import { getAdminClient } from '@/lib/supabase/admin'
import { getVoyageBySlug } from './core'
import { getVoyageMembers } from './members'
import type { VoyageRole } from './types'

export interface VoyageContextMember {
  displayName: string
  role: VoyageRole
  isCurrentUser: boolean
  lastActive: string
}

export interface VoyageContext {
  name: string
  members: VoyageContextMember[]
  totalMembers: number
}

const formatActivityAge = (date: Date | null): string => {
  if (!date) return 'new'
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export const loadVoyageContext = async (
  voyageSlug: string,
  currentUserId: string,
): Promise<VoyageContext | null> => {
  const voyage = await getVoyageBySlug(voyageSlug)
  if (!voyage) return null
  const [members, activityData] = await Promise.all([
    getVoyageMembers(voyage.id),
    getAdminClient().from('knowledge_events').select('user_id, created_at')
      .eq('voyage_slug', voyageSlug).order('created_at', { ascending: false }).limit(200),
  ])
  const activityMap = new Map<string, Date>()
  for (const row of activityData.data ?? []) {
    const userId = row.user_id as string
    if (!activityMap.has(userId)) activityMap.set(userId, new Date(row.created_at as string))
  }
  const sorted = [...members].sort((left, right) => {
    if (left.role === 'captain' && right.role !== 'captain') return -1
    if (left.role !== 'captain' && right.role === 'captain') return 1
    return left.joinedAt.getTime() - right.joinedAt.getTime()
  })
  const displayed = sorted.slice(0, 10)
  return {
    name: voyage.name,
    totalMembers: members.length,
    members: displayed.map((member) => ({
      displayName: member.displayName || member.email?.split('@')[0] || 'Unknown',
      role: member.role,
      isCurrentUser: member.userId === currentUserId,
      lastActive: formatActivityAge(activityMap.get(member.userId) ?? null),
    })),
  }
}

export const formatVoyageContextSection = (context: VoyageContext): string => {
  const lines = ['# Current Voyage', `**${context.name}**`, '']
  for (const member of context.members) {
    const youMarker = member.isCurrentUser ? ' (you)' : ''
    lines.push(`- ${member.displayName} (${member.role})${youMarker} — ${member.lastActive}`)
  }
  if (context.totalMembers > context.members.length) {
    lines.push(`- +${context.totalMembers - context.members.length} others`)
  }
  return lines.join('\n')
}
