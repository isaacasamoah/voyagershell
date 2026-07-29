import { getAdminClient } from '@/lib/supabase/admin'
import { getOpenAI, toVectorString } from './embeddings'
import type { TopicCandidate } from './types'

export interface TopicInput {
  [key: string]: string
  label: string
  embedding: string
}

export const embedCartographerText = async (input: string): Promise<number[]> => {
  const response = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input,
    dimensions: 1536,
  })
  return response.data[0].embedding
}

export const findTopicCandidates = async (
  knowledgeAudienceId: string,
  embedding: number[],
): Promise<TopicCandidate[]> => {
  const { data, error } = await getAdminClient().rpc('find_knowledge_topic_candidates', {
    p_knowledge_audience_id: knowledgeAudienceId,
    p_embedding: toVectorString(embedding),
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((candidate) => ({
    topicId: candidate.topic_id,
    label: candidate.label,
    similarity: candidate.similarity,
  }))
}

export const embedTopicInputs = async (labels: string[]): Promise<TopicInput[]> => {
  if (labels.length === 0) return []
  const response = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input: labels,
    dimensions: 1536,
  })
  return labels.map((label, index) => ({
    label,
    embedding: toVectorString(response.data[index].embedding),
  }))
}
