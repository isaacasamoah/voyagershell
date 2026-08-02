// Semantic search over the event-sourced knowledge system.
import { getClientForContext } from '@/lib/supabase/authenticated'
import { getAdminClient } from '@/lib/supabase/admin'
import { generateSearchEmbedding, toVectorString } from './search-embedding'
import {
  transformKnowledgeNode,
  type KnowledgeNode,
  type KnowledgeNodeInput,
  type SearchOptions,
} from './search-types'

const getClientForUser = (userId: string) => getClientForContext({ userId })

export const searchKnowledge = async (
  userId: string,
  query: string,
  options: SearchOptions = {},
): Promise<KnowledgeNode[]> => {
  const {
    threshold = 0.6,
    limit = 20,
    classifications,
    voyageSlug,
    knowledgeType,
    minAttention = 0.0,
  } = options
  try {
    console.log(
      `[Knowledge] Search: "${query.slice(0, 50)}..." threshold: ${threshold}, limit: ${limit}, type: ${knowledgeType ?? 'all'}, minAttention: ${minAttention}`,
    )
    const embedding = await generateSearchEmbedding(query)
    const rpcKnowledgeType = knowledgeType && knowledgeType !== 'operational'
      ? knowledgeType : undefined
    const { data, error } = await getClientForUser(userId).rpc('search_knowledge', {
      query_embedding: toVectorString(embedding),
      p_user_id: userId,
      p_voyage_slug: voyageSlug,
      p_classifications: classifications as string[] | undefined,
      p_match_threshold: threshold,
      p_match_count: limit,
      p_knowledge_type: rpcKnowledgeType,
      p_min_attention: minAttention,
    })
    if (error) {
      console.error('[Knowledge] Search error:', error)
      return []
    }
    let results: KnowledgeNodeInput[] = data ?? []
    if (knowledgeType === 'operational') {
      results = results.filter((result) =>
        result.knowledge_type === null || result.knowledge_type === 'operational')
    }
    console.log(`[Knowledge] Found ${results.length} results`)
    if (results.length > 0 && results.length <= 5) {
      results.forEach((result) => console.log(
        `  - ${result.content.slice(0, 50)}... (sim: ${result.similarity?.toFixed(3) ?? '-'}, attn: ${result.attention_score ?? '-'})`,
      ))
    }
    return results.map(transformKnowledgeNode)
  } catch (error) {
    console.error('[Knowledge] searchKnowledge error:', error)
    return []
  }
}

export const getKnowledgeByIds = async (
  eventIds: string[],
  userId: string,
  voyageSlug?: string,
): Promise<KnowledgeNode[]> => {
  if (eventIds.length === 0) return []
  try {
    const { data, error } = await getAdminClient().rpc('get_knowledge_by_ids', {
      p_event_ids: eventIds,
      p_user_id: userId,
      p_voyage_slug: voyageSlug ?? null,
    })
    if (error) {
      console.error('[Knowledge] getKnowledgeByIds error:', error)
      return []
    }
    return (data ?? []).map((row) => transformKnowledgeNode({
      ...row,
      similarity: 1.0,
    } as KnowledgeNodeInput))
  } catch (error) {
    console.error('[Knowledge] getKnowledgeByIds error:', error)
    return []
  }
}
