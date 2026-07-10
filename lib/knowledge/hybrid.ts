// Hybrid Search with Reciprocal Rank Fusion (RRF)
// Fuses semantic (pgvector cosine) + keyword (tsvector ts_rank) search
//
// D1: Fusion in TypeScript, not SQL — each primitive stays pure and testable
// D2: RRF over learned weights — parameter-free beyond k, no training data needed

import { searchKnowledge, type SearchOptions, type KnowledgeNode } from './search'
import { getAdminClient } from '@/lib/supabase/admin'
import { cohereRerank, type RerankResult } from './rerank'
import { reformulateQuery } from './reformulate'

// =============================================================================
// Types
// =============================================================================

export interface RankedResult {
  eventId: string
  content: string
  score: number       // RRF score (higher = better)
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

export interface HybridSearchOptions {
  limit?: number              // final result count (default 50 pre-rerank)
  semanticThreshold?: number  // min cosine similarity (default 0.5)
  semanticWeight?: number     // RRF contribution weight (default 1.0)
  keywordWeight?: number      // RRF contribution weight (default 1.0)
  k?: number                  // RRF constant (default 60)
  voyageSlug?: string
  minAttention?: number
  knowledgeType?: string
  reformulate?: boolean       // multi-query reformulation (default false — ships disabled)
}

interface KeywordResult {
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

// =============================================================================
// Keyword Search (tsvector-based, separate from keywordGrep)
// =============================================================================

/**
 * Full-text keyword search using tsvector + ts_rank.
 * Returns results ranked by ts_rank score for RRF fusion.
 * Respects the same scope filters as semantic search.
 */
export const keywordSearch = async (
  userId: string,
  query: string,
  options: {
    limit?: number
    voyageSlug?: string
    knowledgeType?: string
    minAttention?: number
  } = {}
): Promise<KeywordResult[]> => {
  const {
    limit = 50,
    voyageSlug,
    knowledgeType,
    minAttention = 0.0,
  } = options

  try {
    const supabase = getAdminClient()

    // 'operational' type filter is client-side (includes null knowledge_type rows)
    const rpcKnowledgeType = (knowledgeType && knowledgeType !== 'operational') ? knowledgeType : undefined

    // Use admin client — keyword_search RPC is not in generated types yet
    const { data, error } = await (supabase.rpc as Function)('keyword_search', {
      p_query: query,
      p_user_id: userId,
      p_voyage_slug: voyageSlug,
      p_knowledge_type: rpcKnowledgeType,
      p_min_attention: minAttention,
      p_match_count: limit,
      p_participants: [userId],
    })

    if (error) {
      console.error('[Knowledge] keywordSearch error:', error)
      return []
    }

    if (!data || data.length === 0) return []

    // Client-side filter for 'operational' — includes unclassified (null) rows
    let results = (data ?? []) as KeywordResult[]
    if (knowledgeType === 'operational') {
      results = results.filter(
        (r) => r.knowledge_type === null || r.knowledge_type === 'operational'
      )
    }

    return results
  } catch (error) {
    console.error('[Knowledge] keywordSearch error:', error)
    return []
  }
}

// =============================================================================
// RRF Fusion
// =============================================================================

/**
 * Reciprocal Rank Fusion — merges results from multiple ranked lists.
 * score(d) = sum( weight / (k + rank_in_list) ) for each list containing d
 *
 * Deduplicates by eventId — a result in both lists gets contributions from both.
 */
export const rrfFuse = (
  semanticResults: { eventId: string; rank: number; metadata: RankedResult['metadata'] }[],
  keywordResults: { eventId: string; rank: number; metadata: RankedResult['metadata'] }[],
  options: { k?: number; semanticWeight?: number; keywordWeight?: number } = {}
): RankedResult[] => {
  const { k = 60, semanticWeight = 1.0, keywordWeight = 1.0 } = options

  const scoreMap = new Map<string, {
    score: number
    sources: Set<'semantic' | 'keyword'>
    metadata: RankedResult['metadata']
  }>()

  // Score semantic results
  for (const result of semanticResults) {
    const existing = scoreMap.get(result.eventId)
    const contribution = semanticWeight / (k + result.rank)

    if (existing) {
      existing.score += contribution
      existing.sources.add('semantic')
    } else {
      scoreMap.set(result.eventId, {
        score: contribution,
        sources: new Set<'semantic' | 'keyword'>(['semantic']),
        metadata: result.metadata,
      })
    }
  }

  // Score keyword results
  for (const result of keywordResults) {
    const existing = scoreMap.get(result.eventId)
    const contribution = keywordWeight / (k + result.rank)

    if (existing) {
      existing.score += contribution
      existing.sources.add('keyword')
    } else {
      scoreMap.set(result.eventId, {
        score: contribution,
        sources: new Set<'semantic' | 'keyword'>(['keyword']),
        metadata: result.metadata,
      })
    }
  }

  // Convert to sorted array
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

// =============================================================================
// Hybrid Search
// =============================================================================

/**
 * Hybrid search: semantic + keyword with RRF fusion.
 * Runs both search types in parallel, fuses results.
 * Returns up to `limit` results sorted by RRF score.
 */
export const hybridSearch = async (
  userId: string,
  query: string,
  options: HybridSearchOptions = {}
): Promise<RankedResult[]> => {
  const {
    limit = 50,
    semanticThreshold = 0.5,
    semanticWeight = 1.0,
    keywordWeight = 1.0,
    k = 60,
    voyageSlug,
    minAttention = 0.0,
    knowledgeType,
    reformulate = false,
  } = options

  const startTime = Date.now()

  const semanticOpts: SearchOptions = {
    threshold: semanticThreshold,
    limit,
    voyageSlug,
    knowledgeType,
    minAttention,
  }

  const keywordOpts = {
    limit,
    voyageSlug,
    knowledgeType,
    minAttention,
  }

  // Determine queries to search — original only, or original + reformulations
  let queries = [query]
  let reformulateMs = 0

  if (reformulate) {
    const reformulateStart = Date.now()
    const { reformulations } = await reformulateQuery(query)
    reformulateMs = Date.now() - reformulateStart
    if (reformulations.length > 0) {
      queries = [query, ...reformulations]
    }
  }

  // Run hybrid search for each query in parallel
  const searchStart = Date.now()

  const allSearchResults = await Promise.all(
    queries.map(async (q) => {
      const [semanticResults, keywordResults] = await Promise.all([
        searchKnowledge(userId, q, semanticOpts),
        keywordSearch(userId, q, keywordOpts),
      ])
      return { query: q, semanticResults, keywordResults }
    })
  )

  const searchMs = Date.now() - searchStart

  // Transform all results to ranked format and collect for RRF fusion
  const allSemanticRanked: { eventId: string; rank: number; metadata: RankedResult['metadata'] }[] = []
  const allKeywordRanked: { eventId: string; rank: number; metadata: RankedResult['metadata'] }[] = []

  let totalSemantic = 0
  let totalKeyword = 0

  for (const { semanticResults, keywordResults } of allSearchResults) {
    const semanticRanked = semanticResults.map((node, index) => ({
      eventId: node.eventId,
      rank: index + 1,
      metadata: {
        event_id: node.eventId,
        content: node.content,
        source_created_at: node.createdAt.toISOString(),
        classifications: node.classifications,
        entities: node.entities,
        topics: node.topics,
        knowledge_type: node.knowledgeType,
        attention_score: node.attentionScore,
        context_snippet: node.contextSnippet,
        similarity: node.similarity,
      } as RankedResult['metadata'],
    }))

    const keywordRanked = keywordResults.map((row, index) => ({
      eventId: row.event_id,
      rank: index + 1,
      metadata: {
        event_id: row.event_id,
        content: row.content,
        source_created_at: row.source_created_at,
        classifications: row.classifications,
        entities: row.entities,
        topics: row.topics,
        knowledge_type: row.knowledge_type,
        attention_score: row.attention_score,
        context_snippet: row.context_snippet,
      } as RankedResult['metadata'],
    }))

    allSemanticRanked.push(...semanticRanked)
    allKeywordRanked.push(...keywordRanked)
    totalSemantic += semanticResults.length
    totalKeyword += keywordResults.length
  }

  // Fuse ALL result lists with RRF (deduplication is built into rrfFuse)
  const fused = rrfFuse(allSemanticRanked, allKeywordRanked, { k, semanticWeight, keywordWeight })

  // Trim to limit
  const rrfResults = fused.slice(0, limit)

  const fusionMs = Date.now() - startTime

  // Rerank with Cohere (skipped when COHERE_API_KEY is not set)
  const rerankStartTime = Date.now()
  const reranked = await cohereRerank(query, rrfResults)
  const rerankMs = Date.now() - rerankStartTime

  // Map reranked results back to RankedResult format for uniform downstream consumption
  const results: RankedResult[] = reranked.map((r) => ({
    eventId: r.eventId,
    content: r.content,
    score: r.relevanceScore,
    sources: rrfResults.find((rr) => rr.eventId === r.eventId)?.sources ?? [],
    metadata: r.metadata,
  }))

  const totalMs = Date.now() - startTime
  const reformulateLog = reformulate ? `reformulate=${queries.length - 1}q (${reformulateMs}ms), ` : ''
  console.log(
    `[Knowledge] Hybrid search: "${query.slice(0, 50)}..." ` +
    `${reformulateLog}` +
    `semantic=${totalSemantic} (${searchMs}ms), ` +
    `keyword=${totalKeyword}, ` +
    `rerank=${reranked.length} (${rerankMs}ms), ` +
    `fused=${results.length} (total: ${totalMs}ms)`
  )

  return results
}
