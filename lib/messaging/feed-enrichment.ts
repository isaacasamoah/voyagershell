import { getOwnVoyagerIdentity } from '@/lib/messaging/handles'
import { sessionAuthority } from '@/lib/conversation/session-authority'
import { getAdminClient } from '@/lib/supabase/admin'
import type { InviteMembershipState } from './feed-types'

export interface FeedEnrichment {
  sharedSourceEventIds: ReadonlySet<string>
  currentVoyagerDisplayName: string | null
}

type FeedTableClient = Pick<ReturnType<typeof getAdminClient>, 'from'>

export const getFeedTableClient = (): FeedTableClient => getAdminClient()

export const emptyFeedEnrichment = (): FeedEnrichment => ({
  sharedSourceEventIds: new Set(),
  currentVoyagerDisplayName: null,
})

export const resolveViewerInviteStates = async (
  supabase: FeedTableClient,
  spaceIds: string[],
  userId: string,
): Promise<ReadonlyMap<string, InviteMembershipState>> => {
  if (spaceIds.length === 0) return new Map()
  const { data: memberRows, error } = await supabase
    .from('space_members')
    .select('space_id, state')
    .eq('user_id', userId)
    .in('space_id', spaceIds)
  if (error) throw new Error(error.message)
  const rows = (memberRows ?? []) as Array<{ space_id: string; state: InviteMembershipState }>
  const states = new Map<string, InviteMembershipState>()
  for (const row of rows) {
    if (row.state !== 'active') states.set(row.space_id, row.state)
  }
  const activeRows = rows.filter((row) => row.state === 'active')
  if (activeRows.length > 0) {
    const effective = await Promise.all(activeRows.map((row) => getAdminClient().rpc(
      'is_effective_space_member',
      { p_space_id: row.space_id, p_user_id: userId },
    )))
    activeRows.forEach((row, index) => {
      if (effective[index].data === true && !effective[index].error) states.set(row.space_id, 'active')
    })
  }
  return states
}

export const loadPrivateFeedEnrichment = async (
  supabase: FeedTableClient,
  userId: string,
  conversationId: string,
  privateAssistantIds: string[],
): Promise<FeedEnrichment> => {
  if (privateAssistantIds.length === 0) return emptyFeedEnrichment()

  const [identity, session] = await Promise.all([
    getOwnVoyagerIdentity(userId),
    sessionAuthority.getScope(conversationId, userId),
  ])
  const destinationSpaceId = session.space_id
  if (!destinationSpaceId) {
    return {
      sharedSourceEventIds: new Set(),
      currentVoyagerDisplayName: identity.displayName,
    }
  }

  const { data, error } = await supabase
    .from('private_reply_promotions')
    .select('source_event_id')
    .eq('sharer_user_id', userId)
    .eq('destination_space_id', destinationSpaceId)
    .in('source_event_id', privateAssistantIds)
  if (error) throw new Error(error.message)

  return {
    sharedSourceEventIds: new Set(((data ?? []) as Array<{ source_event_id: string }>)
      .map((row) => row.source_event_id)),
    currentVoyagerDisplayName: identity.displayName,
  }
}
