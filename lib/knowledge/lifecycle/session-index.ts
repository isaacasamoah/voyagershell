import { log } from '@/lib/debug/logger'
import { getAdminClient } from '@/lib/supabase/admin'

export const upsertPersonSessionIndex = async (
  personId: string,
  sessionId: string,
  eventCount: number,
): Promise<boolean> => {
  try {
    const { error } = await getAdminClient().rpc('upsert_person_session_index', {
      p_person_id: personId,
      p_session_id: sessionId,
      p_event_count: eventCount,
    })
    if (!error) return true
    log.memory('Person session index failed', {
      personId,
      sessionId,
      error: error.message,
    }, 'warn')
    return false
  } catch (error) {
    log.memory('Person session index failed', {
      personId,
      sessionId,
      error: error instanceof Error ? error.message : 'unknown_error',
    }, 'warn')
    return false
  }
}
