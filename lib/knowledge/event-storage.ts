import { sessionAuthority } from '@/lib/conversation/session-authority'
import { getAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/types'
import type { CreateSourceEventParams } from './event-types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const updateSessionActivity = async (
  conversationId: string,
  userId: string,
): Promise<void> => {
  if (!UUID_RE.test(conversationId)) return

  try {
    await sessionAuthority.touchActivity(conversationId, userId)
  } catch (error) {
    console.error('[Knowledge] Failed to update session activity:', error)
  }
}

export const createSourceEvent = async (
  params: CreateSourceEventParams,
): Promise<string | null> => {
  const {
    eventType,
    content,
    userId,
    voyageSlug,
    participants,
    metadata = {},
    sourceType = 'conversation',
    sourceRef,
    actorId,
    actorType = 'user',
  } = params

  try {
    const { data, error } = await getAdminClient()
      .from('knowledge_events')
      .insert({
        event_type: eventType,
        content,
        user_id: userId,
        voyage_slug: voyageSlug,
        participants: participants ?? null,
        metadata: {
          ...metadata,
          classifications: metadata.classifications ?? [],
          entities: metadata.entities ?? [],
          topics: metadata.topics ?? [],
        },
        source_type: sourceType,
        source_ref: sourceRef as Json | undefined,
        actor_id: actorId,
        actor_type: actorType,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[Knowledge] Failed to create source event:', error)
      return null
    }

    const eventId = data.id as string
    console.log('[Knowledge] Source event created:', eventId)
    return eventId
  } catch (error) {
    console.error('[Knowledge] Error creating source event:', error)
    return null
  }
}
