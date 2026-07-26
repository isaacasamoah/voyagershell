import { log } from '@/lib/debug/logger'
import { getAdminClient } from '@/lib/supabase/admin'
import type { KnowledgeEventRow } from './types'

/** Minimum unenriched events before Cartographer fires. */
export const ENRICHMENT_THRESHOLD = 10

export const shouldRunEnrichment = async (
  sessionId: string,
  userId: string,
): Promise<boolean> => {
  const { count, error } = await getAdminClient()
    .from('knowledge_current')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .is('knowledge_type', null)
    .neq('event_type', 'message')

  if (error) {
    log.agent('Enrichment count check failed', { sessionId, error: error.message }, 'warn')
    return false
  }

  const unenriched = count ?? 0
  log.agent(
    'Enrichment count check',
    { sessionId, unenriched, threshold: ENRICHMENT_THRESHOLD },
    'debug',
  )
  return unenriched >= ENRICHMENT_THRESHOLD
}

export const loadUnenrichedEvents = async (
  sessionId: string,
  userId: string,
): Promise<KnowledgeEventRow[]> => {
  const { data, error } = await getAdminClient()
    .from('knowledge_current')
    .select('event_id, content, source_created_at')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .is('knowledge_type', null)
    .neq('event_type', 'message')
    .order('source_created_at', { ascending: true })

  if (error) {
    log.agent('Failed to load unenriched events', { sessionId, error: error.message }, 'error')
    return []
  }

  return (data ?? []) as KnowledgeEventRow[]
}
