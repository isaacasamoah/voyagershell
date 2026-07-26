import { getAdminClient } from '@/lib/supabase/admin'

export interface RankedResult {
  eventId: string
  content: string
  score: number
  sources: ('semantic' | 'keyword')[]
  metadata: {
    event_id: string
    content: string
    source_created_at: string
    classifications?: string[] | null
    entities?: string[] | null
    topics?: string[] | null
    knowledge_type?: string | null
    attention_score?: number | null
    context_snippet?: string | null
    sender_display_name?: string | null
    sender_user_id?: string | null
    event_type?: string | null
    similarity?: number
  }
}

export interface KeywordResult {
  event_id: string
  content: string
  source_created_at: string
  rank_score: number
  classifications?: string[] | null
  entities?: string[] | null
  topics?: string[] | null
  knowledge_type?: string | null
  attention_score?: number | null
  context_snippet?: string | null
  sender_display_name?: string | null
  sender_user_id?: string | null
  event_type?: string | null
}

export const keywordSearch = async (
  userId: string,
  query: string,
  options: { limit?: number; voyageSlug?: string; knowledgeType?: string; minAttention?: number } = {},
): Promise<KeywordResult[]> => {
  const { limit = 50, voyageSlug, knowledgeType, minAttention = 0.0 } = options
  try {
    const supabase = getAdminClient()
    const rpcKnowledgeType = knowledgeType && knowledgeType !== 'operational'
      ? knowledgeType : undefined
    const { data, error } = await supabase.rpc('keyword_search', {
      p_query: query,
      p_user_id: userId,
      p_voyage_slug: voyageSlug,
      p_knowledge_type: rpcKnowledgeType,
      p_min_attention: minAttention,
      p_match_count: limit,
    })
    if (error) {
      console.error('[Knowledge] keywordSearch error:', error)
      return []
    }
    let results: KeywordResult[] = data ?? []
    if (knowledgeType === 'operational') {
      results = results.filter((result) =>
        result.knowledge_type === null || result.knowledge_type === 'operational')
    }
    return results
  } catch (error) {
    console.error('[Knowledge] keywordSearch error:', error)
    return []
  }
}

type RankedInput = { eventId: string; rank: number; metadata: RankedResult['metadata'] }

export const rrfFuse = (
  semanticResults: RankedInput[],
  keywordResults: RankedInput[],
  options: { k?: number; semanticWeight?: number; keywordWeight?: number } = {},
): RankedResult[] => {
  const { k = 60, semanticWeight = 1.0, keywordWeight = 1.0 } = options
  const scoreMap = new Map<string, {
    score: number
    sources: Set<'semantic' | 'keyword'>
    metadata: RankedResult['metadata']
  }>()
  const addResults = (results: RankedInput[], source: 'semantic' | 'keyword', weight: number) => {
    for (const result of results) {
      const existing = scoreMap.get(result.eventId)
      const contribution = weight / (k + result.rank)
      if (existing) {
        existing.score += contribution
        existing.sources.add(source)
      } else {
        scoreMap.set(result.eventId, {
          score: contribution,
          sources: new Set([source]),
          metadata: result.metadata,
        })
      }
    }
  }
  addResults(semanticResults, 'semantic', semanticWeight)
  addResults(keywordResults, 'keyword', keywordWeight)
  return Array.from(scoreMap.entries())
    .map(([eventId, { score, sources, metadata }]) => ({
      eventId,
      content: metadata.content,
      score,
      sources: Array.from(sources),
      metadata,
    }))
    .sort((a, b) => b.score - a.score)
}
