import type { VoyageConfig } from '@/lib/prompts/types'
import type {
  UserVoyageRow,
  Voyage,
  VoyageMember,
  VoyageMemberRow,
  VoyageMembership,
  VoyageRow,
} from './types'

export const transformVoyage = (row: VoyageRow): Voyage => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  isPublic: row.is_public,
  inviteCode: row.invite_code,
  config: row.settings as VoyageConfig | null,
  createdBy: row.created_by,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
})

export const transformMember = (row: VoyageMemberRow & {
  profiles?: { email?: string; display_name?: string; username?: string | null }
}): VoyageMember => ({
  id: row.id,
  voyageId: row.voyage_id,
  userId: row.user_id,
  role: row.role,
  state: 'active',
  revision: row.revision,
  nickname: row.nickname ?? undefined,
  notificationsEnabled: row.notifications_enabled,
  joinedAt: new Date(row.joined_at),
  email: row.profiles?.email,
  displayName: row.profiles?.display_name,
  username: row.profiles?.username ?? undefined,
})

export const transformMembership = (row: UserVoyageRow): VoyageMembership => ({
  voyageId: row.voyage_id,
  slug: row.slug,
  name: row.name,
  role: row.role,
  joinedAt: new Date(row.joined_at),
})
