'use client'

// The live wire (M0.2): subscribe to my delivery rows, fetch content for new
// arrivals, stamp honest receipts. Delivery ≠ awareness — this hook is pure
// delivery, no model anywhere.
//
// Contract from migration 036: AUTHENTICATED Realtime channel (RLS applies to
// postgres_changes) + server-side filter recipient_user_id=eq.<userId>.

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface IncomingMessage {
  deliveryId: string
  eventId: string
  content: string
  senderDisplayName: string
  createdAt: string
}

const fetchPending = async (): Promise<IncomingMessage[]> => {
  const res = await fetch('/api/messages/pending')
  if (!res.ok) return []
  const data = await res.json()
  return (data.messages ?? []) as IncomingMessage[]
}

const stamp = async (
  deliveryIds: string[],
  opts: { delivered?: boolean; seen?: boolean },
): Promise<void> => {
  if (deliveryIds.length === 0) return
  const res = await fetch('/api/messages/receipts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ delivery_ids: deliveryIds, ...opts }),
  })
  if (!res.ok) {
    throw new Error(await res.text())
  }
}

/**
 * Live message deliveries for the signed-in user.
 * - On mount: catch-up (unseen rows render, stamped delivered).
 * - Live: Realtime INSERT → fetch content → render → stamp delivered.
 * - Seen: stamped when the tab is visible (the human could see it) —
 *   viewport-level precision can come with the stack UI (M1).
 */
export const useDeliveries = (userId: string | null) => {
  const [incoming, setIncoming] = useState<IncomingMessage[]>([])
  const knownDeliveries = useRef(new Set<string>())
  const seenStamped = useRef(new Set<string>())
  const seenInFlight = useRef(new Set<string>())

  const absorb = useCallback((items: IncomingMessage[]) => {
    if (items.length === 0) return
    const fresh = items.filter((m) => !knownDeliveries.current.has(m.deliveryId))
    if (fresh.length === 0) return

    for (const item of fresh) {
      knownDeliveries.current.add(item.deliveryId)
    }
    setIncoming((prev) => [...prev, ...fresh])
    stamp(fresh.map((m) => m.deliveryId), { delivered: true }).catch((error) => {
      console.warn('[deliveries] delivered receipt failed', error)
    })
  }, [])

  const markSeen = useCallback((deliveryId: string) => {
    if (seenStamped.current.has(deliveryId) || seenInFlight.current.has(deliveryId)) return

    seenInFlight.current.add(deliveryId)
    stamp([deliveryId], { seen: true })
      .then(() => {
        seenStamped.current.add(deliveryId)
      })
      .catch((error) => {
        console.warn('[deliveries] seen receipt failed', error)
      })
      .finally(() => {
        seenInFlight.current.delete(deliveryId)
      })
  }, [])

  useEffect(() => {
    knownDeliveries.current = new Set()
    seenStamped.current = new Set()
    seenInFlight.current = new Set()
    setIncoming([])

    if (!userId) {
      return
    }
    let cancelled = false

    // Catch-up: whatever waited while we were away
    fetchPending().then((items) => {
      if (!cancelled) absorb(items)
    })

    // Live wire
    const supabase = createClient()
    const channel = supabase
      .channel(`deliveries:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_deliveries',
          filter: `recipient_user_id=eq.${userId}`,
        },
        () => {
          // Row payload has no content (that lives in knowledge_events) —
          // fetch the pending set, absorb() dedupes.
          fetchPending().then((items) => {
            if (!cancelled) absorb(items)
          })
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [userId, absorb])

  return { incoming, markSeen }
}
