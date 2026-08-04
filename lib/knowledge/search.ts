// Semantic search over the event-sourced knowledge system.
import { semanticUnitSearch } from './unit-search'
import type { KnowledgeNode, SearchOptions } from './search-types'

/**
 * Search for knowledge that is safe to carry into ambient conversation
 * continuity. Retired claims remain visible through explicit search tools but
 * must not survive this boundary as established background about the user.
 */
export const searchKnowledge = async (
  userId: string,
  query: string,
  options: SearchOptions = {},
): Promise<KnowledgeNode[]> => {
  const { threshold = 0.6, limit = 20, knowledgeType } = options
  try {
    console.log(
      `[Knowledge] Search: "${query.slice(0, 50)}..." threshold: ${threshold}, limit: ${limit}, type: ${knowledgeType ?? 'all'}`,
    )
    const result = await semanticUnitSearch(userId, query, { threshold, limit })
    const continuityEligibleHits = result.hits.filter((hit) => !hit.retired)
    const results = knowledgeType
      ? continuityEligibleHits.filter((hit) => hit.knowledgeType === knowledgeType)
      : continuityEligibleHits
    return results.map((hit): KnowledgeNode => ({
      eventId: hit.sourceEventId,
      content: hit.claim,
      classifications: [], entities: [], topics: [],
      createdAt: new Date(hit.sourceCreatedAt),
      similarity: hit.score ?? undefined,
      knowledgeType: hit.knowledgeType,
      attentionScore: hit.effectiveAttention,
      contextSnippet: hit.claim,
    }))
  } catch (error) {
    console.error('[Knowledge] searchKnowledge error:', error)
    return []
  }
}
