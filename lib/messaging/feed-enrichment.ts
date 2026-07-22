import { getOwnVoyagerIdentity } from '@/lib/messaging/handles'
import { getAdminClient } from '@/lib/supabase/admin'
import { getVoyageBySlug } from '@/lib/voyage'
import type { InviteState } from './feed-types'

export interface FeedEnrichment {
  sharedSourceEventIds: ReadonlySet<string>
  currentVoyagerDisplayName: string | null
}

type FeedTableClient = {
  from: (table: string) => any
}

export const getFeedTableClient = (): FeedTableClient => (
  getAdminClient() as unknown as FeedTableClient
)

export const emptyFeedEnrichment = (): FeedEnrichment => ({
  sharedSourceEventIds: new Set(),
  currentVoyagerDisplayName: null,
})

// The viewer's own membership state across this voyage's space(s). Prefer an
// open invite so a pending knock still shows Join/Decline; fall back to
// active/left for a resolved knock (so buttons don't reappear after joining).
export const resolveViewerInviteState = async (
  supabase: FeedTableClient,
  voyageSlug: string,
  userId: string,
): Promise<InviteState | null> => {
  const voyage = await getVoyageBySlug(voyageSlug)
  if (!voyage) return null

  const { data: spaceRows } = await supabase
    .from('spaces')
    .select('id')
    .eq('voyage_id', voyage.id)
  const spaceIds = ((spaceRows ?? []) as Array<{ id: string }>).map((row) => row.id)
  if (spaceIds.length === 0) return null

  const { data: memberRows } = await supabase
    .from('space_members')
    .select('state')
    .eq('user_id', userId)
    .in('space_id', spaceIds)
  const states = ((memberRows ?? []) as Array<{ state: InviteState }>).map((row) => row.state)
  if (states.includes('invited')) return 'invited'
  if (states.includes('active')) return 'active'
  if (states.includes('left')) return 'left'
  return null
}

export const loadPrivateFeedEnrichment = async (
  supabase: FeedTableClient,
  userId: string,
  conversationId: string,
  privateAssistantIds: string[],
): Promise<FeedEnrichment> => {
  if (privateAssistantIds.length === 0) return emptyFeedEnrichment()

  const [identity, sessionResult] = await Promise.all([
    getOwnVoyagerIdentity(userId),
    supabase
      .from('sessions')
      .select('space_id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle(),
  ])
  if (sessionResult.error) throw new Error(sessionResult.error.message)
  const destinationSpaceId = (sessionResult.data as { space_id: string | null } | null)?.space_id ?? null
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
