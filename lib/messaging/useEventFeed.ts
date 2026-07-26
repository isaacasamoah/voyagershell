'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  fromFeedApiEvent,
  mergeFeedEvent,
  sortFeedEvents,
  type FeedApiEvent,
  type FeedEvent,
} from './feed-types'

interface UseEventFeedParams {
  conversationId: string | null
  userId: string | null
}

interface KnowledgeInsertPayload {
  event_type?: string
  participants?: string[] | null
  metadata?: Record<string, unknown> | null
  source_ref?: Record<string, unknown> | null
}

const getPayloadSessionId = (payload: KnowledgeInsertPayload): string | null => {
  const metadataSessionId = payload.metadata?.session_id
  if (typeof metadataSessionId === 'string') return metadataSessionId
  const sourceRefConversationId = payload.source_ref?.conversation_id
  return typeof sourceRefConversationId === 'string' ? sourceRefConversationId : null
}

const shouldRefreshForKnowledgeInsert = (
  payload: KnowledgeInsertPayload,
  userId: string,
  conversationId: string,
) => {
  if (payload.event_type !== 'conversation' && payload.event_type !== 'message') return false
  if (!payload.participants?.includes(userId)) return false
  if (payload.event_type === 'conversation') return getPayloadSessionId(payload) === conversationId
  return true
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
  if (!res.ok) throw new Error(await res.text())
}

export const useEventFeed = ({ conversationId, userId }: UseEventFeedParams) => {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const deliveredStamped = useRef(new Set<string>())
  const seenStamped = useRef(new Set<string>())
  const seenInFlight = useRef(new Set<string>())

  const stampDelivered = useCallback((items: FeedEvent[]) => {
    const deliveryIds = items
      .map((event) => event.deliveryId)
      .filter((id): id is string => typeof id === 'string' && !deliveredStamped.current.has(id))
    if (deliveryIds.length === 0) return

    for (const id of deliveryIds) deliveredStamped.current.add(id)
    stamp(deliveryIds, { delivered: true }).catch((error) => {
      for (const id of deliveryIds) deliveredStamped.current.delete(id)
      console.warn('[feed] delivered receipt failed', error)
    })
  }, [])

  const loadFeed = useCallback(async (replace = false) => {
    if (!conversationId || !userId) {
      setEvents([])
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch(`/api/feed?conversationId=${encodeURIComponent(conversationId)}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(await res.text())

      const data = await res.json() as { events?: FeedApiEvent[] }
      const next = (data.events ?? []).map(fromFeedApiEvent)
      setEvents((prev) => (
        replace
          ? sortFeedEvents(next)
          : next.reduce((acc, event) => mergeFeedEvent(acc, event), prev)
      ))
      stampDelivered(next)
    } catch (error) {
      console.warn('[feed] fetch failed', error)
      if (replace) setEvents([])
    } finally {
      setIsLoading(false)
    }
  }, [conversationId, stampDelivered, userId])

  const markSeen = useCallback((deliveryId: string) => {
    if (seenStamped.current.has(deliveryId) || seenInFlight.current.has(deliveryId)) return

    seenInFlight.current.add(deliveryId)
    setEvents((prev) => prev.map((event) => (
      event.deliveryId === deliveryId ? { ...event, seen: true } : event
    )))

    stamp([deliveryId], { seen: true })
      .then(() => {
        seenStamped.current.add(deliveryId)
      })
      .catch((error) => {
        console.warn('[feed] seen receipt failed', error)
      })
      .finally(() => {
        seenInFlight.current.delete(deliveryId)
      })
  }, [])

  useEffect(() => {
    deliveredStamped.current = new Set()
    seenStamped.current = new Set()
    seenInFlight.current = new Set()
    setEvents([])
    void loadFeed(true)
  }, [conversationId, loadFeed, userId])

  // Catch-up backstop. Supabase Realtime is best-effort — a dropped push (tab
  // backgrounded, a brief websocket reconnect) leaves a delivered message
  // invisible until the NEXT push triggers a refetch. Re-pull on focus /
  // visibility and on a slow interval while active so a missed push self-heals
  // within seconds instead of hanging until the next message arrives.
  useEffect(() => {
    if (!conversationId || !userId) return

    const catchUp = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void loadFeed(false)
    }

    window.addEventListener('focus', catchUp)
    document.addEventListener('visibilitychange', catchUp)
    const interval = setInterval(catchUp, 12_000)

    return () => {
      window.removeEventListener('focus', catchUp)
      document.removeEventListener('visibilitychange', catchUp)
      clearInterval(interval)
    }
  }, [conversationId, userId, loadFeed])

  useEffect(() => {
    if (!conversationId || !userId) return

    const supabase = createClient()
    const refresh = () => {
      void loadFeed(false)
    }
    const channel = supabase
      .channel(`event-feed:${conversationId}:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'knowledge_events' },
        (payload) => {
          if (shouldRefreshForKnowledgeInsert(
            payload.new as KnowledgeInsertPayload,
            userId,
            conversationId,
          )) refresh()
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_deliveries',
          filter: `recipient_user_id=eq.${userId}`,
        },
        refresh,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'message_deliveries',
          filter: `recipient_user_id=eq.${userId}`,
        },
        refresh,
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [conversationId, loadFeed, userId])

  const reload = useCallback(async (): Promise<void> => {
    await loadFeed(true)
  }, [loadFeed])

  return { events, isLoading, markSeen, reload }
}
