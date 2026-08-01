import { getAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/types'
import { getOpenAI, toVectorString } from './embeddings'
import type {
  TopicCandidate,
  TopicMatchDecision,
} from './types'

export interface LegacyTopicInput {
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
  extractorVersion: string,
  knowledgeAudienceId: string,
  embedding: number[],
  excludeUnitId?: string,
): Promise<TopicCandidate[]> => {
  const { data, error } = await getAdminClient().rpc('resolve_knowledge_topic', {
    p_extractor_version: extractorVersion,
    p_knowledge_audience_id: knowledgeAudienceId,
    p_embedding: toVectorString(embedding),
    p_exclude_unit_id: excludeUnitId ?? null,
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((candidate) => {
    const representative = candidate.representative_claim
      && candidate.representative_unit_id
      ? {
        representativeUnitId: candidate.representative_unit_id,
        representativeClaim: candidate.representative_claim,
      }
      : {}
    return {
      topicId: candidate.topic_id,
      label: candidate.label,
      ...representative,
      similarity: candidate.similarity,
    }
  })
}

export const embedLegacyTopicInputs = async (
  labels: string[],
): Promise<LegacyTopicInput[]> => {
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

export const toTopicWriteInputs = (
  decisions: TopicMatchDecision[],
): Json[] => decisions.map((decision) => (
  decision.kind === 'existing'
    ? { kind: 'existing', topicId: decision.topicId }
    : { kind: 'new', label: decision.label }
))

export const toTopicCandidateSnapshot = (
  candidates: TopicCandidate[],
): Json => candidates.map(({ topicId, representativeUnitId }) => {
  if (!representativeUnitId) {
    throw new Error('knowledge_topic_candidate_representative_missing')
  }
  return [topicId, representativeUnitId]
})

export const parseVectorString = (value: string): number[] => (
  value.slice(1, -1).split(',').map(Number)
)
