// The ingress boundary — one claim, one commit.
//
// Everything a person's message commits together: the audience that may ever see
// it, the immutable event, its identity in the graph, and the delivery outbox.
// One database function owns all of it, and it takes the exactly-once claim
// BEFORE writing anything, so a retry — a double tap, a reconnect, a browser
// replay — cannot produce a second event, a second graph fragment, a second
// delivery or a second model call.
//
// Auth and audience are resolved by the caller before this runs. What this
// module adds is the ordering: nothing with an effect happens until the claim
// has been won.

import { getAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/debug'
import { updateSessionActivity } from '@/lib/knowledge/event-storage'
import type { Json } from '@/lib/supabase/types'
import type { RoomState } from './room'

export type IngressTransport = 'chat' | 'room' | 'share' | 'agent'

export interface IngressOutcome {
  eventId: string
  /** `created` means this caller wrote the event; `replayed` means an identical
   *  earlier request already did, and no second effect was produced. */
  status: 'created' | 'replayed'
  /** Who the delivery outbox was fanned out to. Empty for a private turn. */
  recipients: string[]
}

/** A same-key/different-payload attempt. Nothing was written and the caller must
 *  not proceed to a model call or a fan-out. */
export class IngressConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IngressConflictError'
  }
}

export interface IngressMember {
  userId: string
  displayName?: string | null
  email?: string | null
}

export interface ResolveIngressInput {
  userId: string
  sessionId: string
  voyageSlug: string | null
  clientMessageId: string
  content: string
  /** An explicit private aside stays private even inside a populated room. */
  isAside: boolean
  room: RoomState
  /** Current voyage members — a room person who has left the voyage is not an
   *  audience member, exactly as the previous fan-out required. */
  voyageMembers: IngressMember[]
  senderDisplayName: string
}

interface ResolvedIngress {
  spaceId: string | null
  recipients: string[]
  audienceMemberIds: string[]
  eventType: 'message' | 'conversation'
  source?: string
  attention?: { score: number; snippet: string }
  metadata: Record<string, Json | undefined>
}

// The room is the only scope that widens an audience beyond its author, and it
// only does so for people who are BOTH active in the room and still in the
// voyage. Everything else — an empty room, an explicit aside — is the author's
// own private event, exactly as it was before the claim existed.
const resolveIngress = (input: ResolveIngressInput): ResolvedIngress => {
  const { userId, sessionId, room, isAside, senderDisplayName, content } = input
  const inRoom = room.roomPeople.length > 0 && room.spaceId !== null
  const base = {
    classifications: [] as Json,
    entities: [] as Json,
    topics: [] as Json,
    session_id: sessionId,
  }

  if (!inRoom || isAside) {
    return {
      spaceId: null,
      recipients: [],
      audienceMemberIds: [userId],
      eventType: 'conversation',
      source: isAside && inRoom ? 'aside' : undefined,
      metadata: { ...base, source: isAside && inRoom ? 'aside' : undefined },
    }
  }

  const currentIds = new Set(input.voyageMembers.map((member) => member.userId))
  const recipients = room.roomPeople.filter((id) => id !== userId && currentIds.has(id))
  return {
    spaceId: room.spaceId,
    recipients,
    audienceMemberIds: [userId, ...recipients],
    eventType: 'message',
    source: 'room',
    attention: {
      score: 0.85,
      snippet: `${senderDisplayName} in room: ${content.slice(0, 60)}`,
    },
    metadata: {
      ...base,
      addressed_to: recipients,
      source: 'room',
      sender_display_name: senderDisplayName,
      sender_user_id: userId,
    },
  }
}

/**
 * Claim the intent and commit the whole ingress. Throws IngressConflictError
 * when the same actor + transport + client message id arrives carrying a
 * different payload — nothing is written in that case.
 */
export const claimSourceIngress = async (
  input: ResolveIngressInput,
  transport: IngressTransport = 'chat',
): Promise<IngressOutcome> => {
  const resolved = resolveIngress(input)
  const { data, error } = await getAdminClient().rpc('claim_source_message_ingress', {
    p_actor_id: input.userId,
    p_transport: transport,
    p_client_message_id: input.clientMessageId,
    p_space_id: resolved.spaceId,
    p_voyage_slug: input.voyageSlug,
    p_content: input.content,
    p_event_type: resolved.eventType,
    p_source_type: 'conversation',
    p_actor_type: 'user',
    p_audience_member_ids: resolved.audienceMemberIds,
    p_recipient_ids: resolved.recipients,
    p_metadata: resolved.metadata as Json,
    p_source_ref: { conversation_id: input.sessionId, role: 'user' } as Json,
  })

  if (error) {
    if (error.message.includes('source_intent_payload_conflict')) {
      throw new IngressConflictError(error.message)
    }
    throw new Error(error.message)
  }
  const row = data?.[0]
  if (!row?.event_id) throw new Error('source_ingress_returned_no_event')

  return { eventId: row.event_id, status: row.status, recipients: resolved.recipients }
}

export const enrichNewIngress = async (
  input: ResolveIngressInput,
  outcome: IngressOutcome,
): Promise<void> => {
  if (outcome.status !== 'created') return
  await updateSessionActivity(input.sessionId, input.userId).catch(() => {})
}
