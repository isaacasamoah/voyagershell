// Cohere Reranking for hybrid search pipeline
// Slot: hybridSearch(50) -> cohereRerank(top 15) -> return to agent
//
// D1: Graceful degradation — Cohere unavailable = RRF order preserved
// D2: Runtime env read — no build-time dependency on COHERE_API_KEY

import type { RankedResult } from './hybrid-primitives'

// =============================================================================
// Types
// =============================================================================

export interface RerankOptions {
  topN?: number             // how many to keep (default 15)
  model?: string            // Cohere model (default 'rerank-v3.5')
  returnDocuments?: boolean
}

export interface RerankResult {
  eventId: string
  content: string
  relevanceScore: number    // Cohere relevance score (0-1)
  originalRank: number      // position before reranking
  metadata: RankedResult['metadata']
}

// Cohere API v2 response shape (subset we use)
interface CohereRerankResponse {
  results: {
    index: number
    relevance_score: number
  }[]
}

// =============================================================================
// Reranking
// =============================================================================

/**
 * Rerank hybrid search candidates using Cohere Rerank API v2.
 * When Cohere is unavailable, returns candidates in original RRF order.
 */
export const cohereRerank = async (
  query: string,
  candidates: RankedResult[],
  options: RerankOptions = {}
): Promise<RerankResult[]> => {
  const {
    topN = 15,
    model = 'rerank-v3.5',
  } = options

  const apiKey = process.env.COHERE_API_KEY
  if (!apiKey) {
    return fallbackResults(candidates, topN)
  }

  if (candidates.length === 0) return []

  // Build documents for Cohere — prepend context_snippet if present
  const documents = candidates.map((c) => {
    const snippet = c.metadata.context_snippet
    return snippet ? `${snippet}\n\n${c.content}` : c.content
  })

  const startTime = Date.now()

  try {
    const response = await fetch('https://api.cohere.com/v2/rerank', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        query,
        documents,
        top_n: topN,
        return_documents: false,
      }),
    })

    const rerankMs = Date.now() - startTime

    if (!response.ok) {
      console.warn(
        `[Knowledge] Cohere rerank degraded: HTTP ${response.status} (${rerankMs}ms), using RRF order`
      )
      return fallbackResults(candidates, topN)
    }

    const data = (await response.json()) as CohereRerankResponse

    console.log(
      `[Knowledge] Cohere rerank: ${candidates.length} -> ${data.results.length} results (${rerankMs}ms)`
    )

    return data.results.map((r) => {
      const candidate = candidates[r.index]
      return {
        eventId: candidate.eventId,
        content: candidate.content,
        relevanceScore: r.relevance_score,
        originalRank: r.index + 1,
        metadata: candidate.metadata,
      }
    })
  } catch (error) {
    const rerankMs = Date.now() - startTime
    console.warn(
      `[Knowledge] Cohere rerank degraded: ${error instanceof Error ? error.message : 'unknown error'} (${rerankMs}ms), using RRF order`
    )
    return fallbackResults(candidates, topN)
  }
}

// =============================================================================
// Fallback
// =============================================================================

/** Return candidates in original RRF order when reranking is unavailable */
const fallbackResults = (candidates: RankedResult[], topN: number): RerankResult[] =>
  candidates.slice(0, topN).map((c, i) => ({
    eventId: c.eventId,
    content: c.content,
    relevanceScore: c.score, // Use RRF score as stand-in
    originalRank: i + 1,
    metadata: c.metadata,
  }))
