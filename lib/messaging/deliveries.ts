// The delivery lane — pure code, its own clock (delivery ≠ awareness).
// message_deliveries is the Ledger's receipts facet: one row per recipient
// per message, the single source of delivery truth.

import { getAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/debug'

// message_deliveries is not in generated Supabase types yet — contain the
// untyped access here (same pattern as knowledge_edges / brain_connections).
const table = () => (getAdminClient() as unknown as { from: (t: string) => any })
  .from('message_deliveries')

/**
 * Fan out delivery rows for a message event — one per recipient, at send
 * time. Idempotent via the (event_id, recipient_user_id) unique constraint.
 * A delivery hiccup must never fail the send (the event is already on the
 * ledger). Failures are logged; there is NO automatic re-fan yet — known
 * M0.2 gap, tracked in the messaging design doc.
 */
export interface PendingMessage {
  deliveryId: string
  eventId: string
  content: string
  senderDisplayName: string
  createdAt: string
  deliveredAt: string | null
}

/** The caller's unseen messages, oldest first — the live wire's catch-up and
 *  the welcome brief's raw material. */
export const getPendingMessages = async (userId: string): Promise<PendingMessage[]> => {
  const { data, error } = await table()
    .select('id, event_id, created_at, delivered_at, knowledge_events(content, metadata)')
    .eq('recipient_user_id', userId)
    .is('seen_at', null)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) {
    log.api('Pending messages query failed', { error: error.message }, 'error')
    return []
  }
  return ((data ?? []) as Array<{
    id: string
    event_id: string
    created_at: string
    delivered_at: string | null
    knowledge_events: { content: string; metadata: Record<string, unknown> | null } | null
  }>).map((row) => ({
    deliveryId: row.id,
    eventId: row.event_id,
    content: row.knowledge_events?.content ?? '',
    senderDisplayName:
      (row.knowledge_events?.metadata?.sender_display_name as string | undefined) ?? 'someone',
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
  }))
}

/** Stamp delivered/seen on the caller's own delivery rows. Ownership enforced
 *  here; forward-only movement enforced by the DB trigger. */
export const stampReceipts = async (
  userId: string,
  deliveryIds: string[],
  stamp: { delivered: boolean; seen: boolean },
): Promise<{ updatedIds: string[] }> => {
  const patch: Record<string, string> = {}
  const now = new Date().toISOString()
  if (stamp.delivered) patch.delivered_at = now
  if (stamp.seen) patch.seen_at = now
  if (Object.keys(patch).length === 0) return { updatedIds: [] }

  const { data, error } = await table()
    .update(patch)
    .in('id', deliveryIds)
    .eq('recipient_user_id', userId) // ownership gate
    .is(stamp.seen ? 'seen_at' : 'delivered_at', null) // forward-only, no re-stamp
    .select('id')
  if (error) {
    log.api('Receipt stamp failed', { error: error.message }, 'error')
    throw new Error(error.message)
  }
  return { updatedIds: ((data ?? []) as Array<{ id: string }>).map((row) => row.id) }
}

export const fanOutDeliveries = async (
  eventId: string,
  recipientUserIds: string[],
): Promise<void> => {
  if (recipientUserIds.length === 0) return
  const rows = recipientUserIds.map((recipient_user_id) => ({
    event_id: eventId,
    recipient_user_id,
  }))
  const { error } = await table().upsert(rows, {
    onConflict: 'event_id,recipient_user_id',
    ignoreDuplicates: true,
  })
  if (error) {
    log.api('Delivery fan-out failed', { eventId, error: error.message }, 'error')
  }
}
