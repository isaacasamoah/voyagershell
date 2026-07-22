import { log } from '@/lib/debug/logger'
import { updateKnowledgeEnrichment } from '@/lib/knowledge/events'
import { writeKnowledgeGraphEdge } from '@/lib/knowledge/kernel/graph-edge-writer'
import { getAdminClient } from '@/lib/supabase/admin'
import { getOpenAI, toVectorString } from './embeddings'
import type { KnowledgeEventRow, Stage1Assessment, Stage2Connection } from './types'

export const applyEnrichments = async (
  assessments: Stage1Assessment[],
  connections: Stage2Connection[],
  events: KnowledgeEventRow[],
): Promise<void> => {
  const supabase = getAdminClient()
  const contentMap = new Map(events.map((event) => [event.event_id, event.content]))
  let successCount = 0
  let failCount = 0

  for (const assessment of assessments) {
    try {
      const originalContent = contentMap.get(assessment.eventId)
      if (originalContent && assessment.contextSnippet) {
        const response = await getOpenAI().embeddings.create({
          model: 'text-embedding-3-small',
          input: `${assessment.contextSnippet} ${originalContent}`,
        })
        await supabase.rpc('update_knowledge_embedding', {
          p_event_id: assessment.eventId,
          p_embedding: toVectorString(response.data[0].embedding),
        })
      }

      await updateKnowledgeEnrichment(assessment.eventId, {
        knowledgeType: assessment.knowledgeType,
        attentionScore: assessment.attentionScore,
        contextSnippet: assessment.contextSnippet || undefined,
      })
      successCount++
    } catch (error) {
      log.agent('Event enrichment failed, will retry next run', {
        eventId: assessment.eventId,
        error: String(error),
      }, 'warn')
      failCount++
    }
  }

  if (failCount > 0) log.agent('Enrichment summary', { successCount, failCount })

  for (const connection of connections) {
    try {
      await writeKnowledgeGraphEdge(connection)
    } catch (error) {
      log.agent('Graph edge creation failed', {
        source: connection.source,
        target: connection.target,
        kind: connection.kind,
        error: String(error),
      }, 'warn')
    }
  }
}
