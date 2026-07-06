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
