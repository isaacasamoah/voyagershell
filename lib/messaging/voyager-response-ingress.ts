// The owner Voyager's response ingress.
//
// A normal reply is not independently scoped: PostgreSQL validates its claimed
// human source event and inherits that source's exact immutable audience.
// Synthetic welcomes have no human source and are restricted there to the
// owner-private conversation shape.

import { updateSessionActivity } from '@/lib/knowledge/event-storage'
import { getAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/types'
import { IngressConflictError, type IngressOutcome } from './ingress'

export interface VoyagerResponseIngressInput {
  userId: string
  sessionId: string
  voyageSlug: string | null
  /** Null only for a synthetic auto-sent welcome, which has no human source. */
  sourceEventId: string | null
  content: string
}

export interface VoyagerResponseEnrichmentInput {
  userId: string
  sessionId: string
  sourceEventId: string | null
  content: string
}

export const claimVoyagerResponseIngress = async (
  input: VoyagerResponseIngressInput,
): Promise<IngressOutcome> => {
  const metadata: Record<string, Json> = {
    classifications: [],
    entities: [],
    topics: [],
    session_id: input.sessionId,
  }
  if (input.sourceEventId) metadata.reply_to_event_id = input.sourceEventId

  const { data, error } = await getAdminClient().rpc('claim_source_message_ingress', {
    p_actor_id: input.userId,
    p_transport: 'agent',
    p_client_message_id: input.sourceEventId
      ? `reply:${input.sourceEventId}`
      : `welcome:${input.sessionId}`,
    p_space_id: null,
    p_voyage_slug: input.voyageSlug,
    p_content: input.content,
    p_event_type: 'conversation',
    p_source_type: 'conversation',
    p_actor_type: 'voyager',
    p_audience_member_ids: [input.userId],
    p_recipient_ids: [],
    p_metadata: metadata as Json,
    p_source_ref: {
      conversation_id: input.sessionId,
      role: 'assistant',
    } as Json,
  })

  if (error) {
    if (error.message.includes('source_intent_payload_conflict')) {
      throw new IngressConflictError(error.message)
    }
    throw new Error(error.message)
  }
  const row = data?.[0]
  if (!row?.event_id) throw new Error('source_ingress_returned_no_event')

  return { eventId: row.event_id, status: row.status, recipients: [] }
}

export const enrichVoyagerResponseIngress = async (
  input: VoyagerResponseEnrichmentInput,
  outcome: IngressOutcome,
): Promise<void> => {
  if (outcome.status !== 'created') return
  await updateSessionActivity(input.sessionId, input.userId).catch(() => {})
}
