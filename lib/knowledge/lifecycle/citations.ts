import { log } from '@/lib/debug/logger'
import { getAdminClient } from '@/lib/supabase/admin'
import type { KnowledgeDeliveryChannel } from '@/lib/supabase/schema/base'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export interface CitationRecordingInput {
  personId: string
  sessionId: string
  channel: KnowledgeDeliveryChannel
  knowledgeUnitIds: readonly string[]
}

export type CitationRecordingResult =
  | { outcome: 'recorded'; inserted: number }
  | { outcome: 'skipped'; inserted: 0 }
  | { outcome: 'failed'; inserted: 0 }

export const recordKnowledgeUnitCitations = async (
  input: CitationRecordingInput,
): Promise<CitationRecordingResult> => {
  const unitIds = Array.from(new Set(input.knowledgeUnitIds)).filter((id) =>
    UUID_PATTERN.test(id),
  )
  if (input.knowledgeUnitIds.length === 0) return { outcome: 'skipped', inserted: 0 }
  if (
    !UUID_PATTERN.test(input.personId)
    || !UUID_PATTERN.test(input.sessionId)
    || unitIds.length !== new Set(input.knowledgeUnitIds).size
    || unitIds.length > 64
  ) {
    return { outcome: 'failed', inserted: 0 }
  }
  try {
    const { data, error } = await getAdminClient().rpc(
      'record_knowledge_unit_citations',
      {
        p_person_id: input.personId,
        p_session_id: input.sessionId,
        p_channel: input.channel,
        p_unit_ids: unitIds,
      },
    )
    if (!error && typeof data === 'number') {
      return { outcome: 'recorded', inserted: data }
    }
    log.memory('Knowledge-unit citation recording failed', {
      personId: input.personId,
      sessionId: input.sessionId,
      channel: input.channel,
      unitCount: unitIds.length,
      error: error?.message ?? 'invalid_result',
    }, 'warn')
  } catch (error) {
    log.memory('Knowledge-unit citation recording failed', {
      personId: input.personId,
      sessionId: input.sessionId,
      channel: input.channel,
      unitCount: unitIds.length,
      error: error instanceof Error ? error.message : 'unknown_error',
    }, 'warn')
  }
  return { outcome: 'failed', inserted: 0 }
}
