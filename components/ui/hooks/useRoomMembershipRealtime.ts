import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface UseRoomMembershipRealtimeParams {
  conversationId: string | null
  userId: string | null
  refreshRoom: () => Promise<void>
}

// Room membership is audience authority, so a membership transition refreshes
// the visible audience directly. It does not wait for another chat message or
// infer room state from an old sessions.space_id pointer.
export const useRoomMembershipRealtime = ({
  conversationId,
  userId,
  refreshRoom,
}: UseRoomMembershipRealtimeParams) => {
  // Realtime is the fast path, not the only path. A tab can miss a push while
  // backgrounded or reconnecting, so refetch on focus and periodically while
  // visible. The server authorization boundary remains synchronous either way.
  useEffect(() => {
    if (!conversationId || !userId) return

    const catchUp = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void refreshRoom()
    }

    window.addEventListener('focus', catchUp)
    document.addEventListener('visibilitychange', catchUp)
    const interval = setInterval(catchUp, 12_000)

    return () => {
      window.removeEventListener('focus', catchUp)
      document.removeEventListener('visibilitychange', catchUp)
      clearInterval(interval)
    }
  }, [conversationId, refreshRoom, userId])

  useEffect(() => {
    if (!conversationId || !userId) return

    const supabase = createClient()
    const channel = supabase
      .channel(`room-membership:${conversationId}:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'space_members' },
        () => {
          void refreshRoom()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [conversationId, refreshRoom, userId])
}
