import { getAdminClient } from '@/lib/supabase/admin'
import type { KnowledgeEnrichmentParams } from './event-types'

export const updateKnowledgeEnrichment = async (
  eventId: string,
  params: KnowledgeEnrichmentParams,
): Promise<boolean> => {
  try {
    const update: Record<string, unknown> = {
      attention_score: params.attentionScore,
      base_attention: params.attentionScore,
      updated_at: new Date().toISOString(),
    }

    if (params.knowledgeType) {
      update.knowledge_type = params.knowledgeType
    }
    if (params.contextSnippet) {
      update.context_snippet = params.contextSnippet
    }

    const { error } = await getAdminClient()
      .from('knowledge_current')
      .update(update)
      .eq('event_id', eventId)

    if (error) {
      console.error('[Knowledge] Failed to update enrichment:', error)
      return false
    }

    console.log(
      `[Knowledge] Enrichment updated for ${eventId}: `
      + `type=${params.knowledgeType}, attention=${params.attentionScore}`,
    )
    return true
  } catch (error) {
    console.error('[Knowledge] Error updating enrichment:', error)
    return false
  }
}
