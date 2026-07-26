import { log } from '@/lib/debug/logger'
import { getAdminClient } from '@/lib/supabase/admin'

export const processRetrievalFeedback = async (
  userId: string,
): Promise<{ promoted: number }> => {
  const supabase = getAdminClient()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: tasks, error: tasksError } = await supabase
    .from('agent_tasks')
    .select('id, result, conversation_id')
    .eq('user_id', userId)
    .eq('status', 'complete')
    .gte('completed_at', cutoff)
  if (tasksError || !tasks || tasks.length === 0) return { promoted: 0 }

  const retrievedEventIds = new Set<string>()
  const sessionIds = new Set<string>()
  for (const task of tasks) {
    const result = task.result as { findings?: Array<{ eventId?: string }> } | null
    if (!result?.findings) continue
    sessionIds.add(task.conversation_id as string)
    for (const finding of result.findings) {
      if (finding.eventId) retrievedEventIds.add(finding.eventId)
    }
  }
  if (retrievedEventIds.size === 0) return { promoted: 0 }

  const { data: windowEvents } = await supabase
    .from('knowledge_current')
    .select('event_id')
    .eq('user_id', userId)
    .gte('attention_score', 0.5)
    .in('session_id', Array.from(sessionIds))
  const windowEventIds = new Set((windowEvents ?? []).map((event) => event.event_id as string))

  const { data: preloaded } = await supabase
    .from('knowledge_current')
    .select('event_id')
    .eq('user_id', userId)
    .or('attention_score.gte.0.9,knowledge_type.eq.preference')
  for (const event of preloaded ?? []) windowEventIds.add(event.event_id as string)

  let promoted = 0
  for (const eventId of Array.from(retrievedEventIds)) {
    if (windowEventIds.has(eventId)) continue
    const { error } = await (supabase as any).rpc('increment_promotion_count', {
      p_event_id: eventId,
    })
    if (error) {
      log.agent('Promotion increment failed', { eventId, error: error.message }, 'warn')
      continue
    }
    promoted++
  }

  log.agent('Retrieval feedback processed', {
    tasksChecked: tasks.length,
    retrievedEvents: retrievedEventIds.size,
    windowEvents: windowEventIds.size,
    promoted,
  }, 'debug')
  return { promoted }
}
