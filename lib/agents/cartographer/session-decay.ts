import { log } from '@/lib/debug/logger'
import { getAdminClient } from '@/lib/supabase/admin'

const DECAY_CURVE: Record<number, number> = {
  0: 1,
  1: 0.9,
  2: 0.75,
  3: 0.5,
  4: 0.4,
  5: 0.3,
}

const getDecayFactor = (distance: number): number => {
  if (distance <= 0) return 1
  if (distance >= 5) return DECAY_CURVE[5]
  return DECAY_CURVE[distance] ?? DECAY_CURVE[5]
}

export const upsertSessionIndex = async (
  sessionId: string,
  userId: string,
  eventCount: number,
): Promise<void> => {
  const supabase = getAdminClient()
  const { error: insertError } = await (supabase as any)
    .from('session_index')
    .insert({
      session_id: sessionId,
      user_id: userId,
      event_count: eventCount,
      started_at: new Date().toISOString(),
    })

  if (!insertError) return
  if (insertError.code !== '23505') {
    log.agent('Session index insert failed', { sessionId, error: insertError.message }, 'warn')
    return
  }

  const { error: updateError } = await (supabase as any)
    .from('session_index')
    .update({ event_count: eventCount })
    .eq('session_id', sessionId)
  if (updateError) {
    log.agent('Session index update failed', { sessionId, error: updateError.message }, 'warn')
  }
}

const getSessionDistances = async (
  userId: string,
  currentSessionId: string,
): Promise<Map<string, number>> => {
  const { data, error } = await (getAdminClient() as any)
    .from('session_index')
    .select('session_id')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(20)
  if (error || !data) return new Map([[currentSessionId, 0]])

  const distances = new Map<string, number>()
  const sessions = data as Array<{ session_id: string }>
  for (let index = 0; index < sessions.length; index++) {
    const row = sessions[index]
    distances.set(row.session_id, index)
  }
  if (!distances.has(currentSessionId)) distances.set(currentSessionId, 0)
  return distances
}

type DecayRow = {
  event_id: string
  session_id: string | null
  knowledge_type: string
  attention_score: number
  base_attention: number | null
  promotion_count: number | null
}

export const applySessionDecay = async (
  userId: string,
  currentSessionId: string,
): Promise<{ decayed: number; skipped: number }> => {
  const supabase = getAdminClient()
  const sessionDistances = await getSessionDistances(userId, currentSessionId)
  const { data, error } = await (supabase as any)
    .from('knowledge_current')
    .select('event_id, session_id, knowledge_type, attention_score, base_attention, promotion_count')
    .eq('user_id', userId)
    .not('knowledge_type', 'is', null)
    .neq('knowledge_type', 'preference')
    .gt('attention_score', 0)

  if (error || !data) {
    log.agent('Decay: failed to load events', { error: error?.message }, 'warn')
    return { decayed: 0, skipped: 0 }
  }

  let decayed = 0
  let skipped = 0
  for (const row of data as DecayRow[]) {
    if (!row.session_id) {
      skipped++
      continue
    }

    const distance = sessionDistances.get(row.session_id) ?? 6
    if (distance === 0) {
      skipped++
      continue
    }

    const originalAttention = row.base_attention ?? row.attention_score
    const rawFactor = getDecayFactor(distance)
    const factor = row.knowledge_type === 'domain'
      ? 1 - (1 - rawFactor) * 0.5
      : rawFactor
    let nextAttention = Math.round(originalAttention * factor * 100) / 100

    if (
      row.knowledge_type === 'domain'
      && distance >= 5
      && (row.promotion_count ?? 0) === 0
    ) {
      const extraDecay = (distance - 5 + 1) * 0.1
      nextAttention = Math.max(0, Math.round((nextAttention - extraDecay) * 100) / 100)
    }

    if (nextAttention === row.attention_score) {
      skipped++
      continue
    }

    const { error: updateError } = await supabase
      .from('knowledge_current')
      .update({ attention_score: nextAttention, updated_at: new Date().toISOString() })
      .eq('event_id', row.event_id)
    if (updateError) skipped++
    else decayed++
  }

  return { decayed, skipped }
}
