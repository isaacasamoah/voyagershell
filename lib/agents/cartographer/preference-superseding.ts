import { log } from '@/lib/debug/logger'
import { getAdminClient } from '@/lib/supabase/admin'
import { getOpenAI } from './embeddings'
import type { Stage1Assessment } from './types'

const cosineSimilarity = (a: number[], b: number[]): number => {
  let dot = 0
  for (let index = 0; index < a.length; index++) dot += a[index] * b[index]
  return dot
}

export const checkPreferenceSuperseding = async (
  assessments: Stage1Assessment[],
  userId: string,
): Promise<number> => {
  const supabase = getAdminClient()
  const newPreferences = assessments.filter((item) => item.knowledgeType === 'preference')
  if (newPreferences.length === 0) return 0

  const { data: existingPreferences, error } = await supabase
    .from('knowledge_current')
    .select('event_id, content, context_snippet')
    .eq('user_id', userId)
    .eq('knowledge_type', 'preference')
    .gt('attention_score', 0)
    .is('superseded_by', null)
  if (error || !existingPreferences || existingPreferences.length === 0) return 0

  let existingEmbeddings: number[][]
  try {
    const response = await getOpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: existingPreferences.map((preference) => (
        (preference.context_snippet as string)
        || (preference.content as string).slice(0, 200)
      )),
    })
    existingEmbeddings = response.data.map((item) => item.embedding)
  } catch {
    log.agent('Failed to embed existing preferences for superseding check', {}, 'warn')
    return 0
  }

  let supersededCount = 0
  for (const newPreference of newPreferences) {
    let newEmbedding: number[]
    try {
      const response = await getOpenAI().embeddings.create({
        model: 'text-embedding-3-small',
        input: newPreference.contextSnippet || 'preference',
      })
      newEmbedding = response.data[0].embedding
    } catch {
      continue
    }

    for (let index = 0; index < existingPreferences.length; index++) {
      const existing = existingPreferences[index]
      if (existing.event_id === newPreference.eventId) continue
      const similarity = cosineSimilarity(newEmbedding, existingEmbeddings[index])
      if (similarity < 0.85) continue

      const { error: updateError } = await (supabase as any)
        .from('knowledge_current')
        .update({
          attention_score: 0,
          superseded_by: newPreference.eventId,
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', existing.event_id)
      if (updateError) continue

      supersededCount++
      log.agent('Preference superseded', {
        old: existing.event_id,
        new: newPreference.eventId,
        similarity: similarity.toFixed(3),
      })
    }
  }

  return supersededCount
}
