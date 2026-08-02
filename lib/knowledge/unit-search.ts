import { getAdminClient } from '@/lib/supabase/admin'
import type {
  KnowledgeUnitKeywordRow,
  KnowledgeUnitSearchRow,
} from '@/lib/supabase/schema/functions'
import { generateSearchEmbedding, toVectorString } from './search-embedding'

export interface KnowledgeUnitHit {
  readonly unitId: string
  readonly claim: string
  readonly sourceEventId: string
  readonly sourceContent: string
  readonly sourceCreatedAt: string
  readonly knowledgeType: string
  readonly effectiveAttention: number
  readonly score: number | null
}

export type KnowledgeUnitSearchResult =
  | { readonly outcome: 'success'; readonly hits: readonly KnowledgeUnitHit[] }
  | { readonly outcome: 'error'; readonly hits: readonly [] }

const success = (
  rows: readonly (KnowledgeUnitSearchRow | KnowledgeUnitKeywordRow)[],
): KnowledgeUnitSearchResult => ({
  outcome: 'success',
  hits: rows.map((row) => ({
    unitId: row.unit_id,
    claim: row.claim,
    sourceEventId: row.source_event_id,
    sourceContent: row.source_content,
    sourceCreatedAt: row.source_created_at,
    knowledgeType: row.knowledge_type,
    effectiveAttention: row.effective_attention,
    score: 'similarity' in row ? row.similarity : row.rank_score,
  })),
})

export const semanticUnitSearch = async (
  viewerProfileId: string,
  query: string,
  options: { threshold?: number; limit?: number } = {},
): Promise<KnowledgeUnitSearchResult> => {
  try {
    const embedding = await generateSearchEmbedding(query)
    const { data, error } = await getAdminClient().rpc(
      'search_knowledge_units',
      {
        p_viewer_profile_id: viewerProfileId,
        p_query_embedding: toVectorString(embedding),
        p_match_threshold: options.threshold ?? 0.6,
        p_match_count: options.limit ?? 10,
      },
    )
    return error ? { outcome: 'error', hits: [] } : success(data ?? [])
  } catch {
    return { outcome: 'error', hits: [] }
  }
}

export const keywordUnitSearch = async (
  viewerProfileId: string,
  query: string,
  options: { limit?: number; anchorPersonId?: string } = {},
): Promise<KnowledgeUnitSearchResult> => {
  try {
    const { data, error } = await getAdminClient().rpc(
      'keyword_search_units',
      {
        p_viewer_profile_id: viewerProfileId,
        p_query: query,
        p_match_count: options.limit ?? 10,
        p_anchor_person_id: options.anchorPersonId,
      },
    )
    return error ? { outcome: 'error', hits: [] } : success(data ?? [])
  } catch {
    return { outcome: 'error', hits: [] }
  }
}

const scopedUnitSearch = async (
  viewerProfileId: string,
  parameters: {
    anchorPersonId?: string
    since?: string
    until?: string
    unitIds?: readonly string[]
    limit?: number
  },
): Promise<KnowledgeUnitSearchResult> => {
  try {
    const { data, error } = await getAdminClient().rpc(
      'search_knowledge_units',
      {
        p_viewer_profile_id: viewerProfileId,
        p_query_embedding: null,
        p_match_count: parameters.limit ?? 20,
        p_anchor_person_id: parameters.anchorPersonId,
        p_since: parameters.since,
        p_until: parameters.until,
        p_unit_ids: parameters.unitIds ? [...parameters.unitIds] : undefined,
      },
    )
    return error ? { outcome: 'error', hits: [] } : success(data ?? [])
  } catch {
    return { outcome: 'error', hits: [] }
  }
}

export const anchoredUnitSearch = async (
  viewerProfileId: string,
  anchorPersonId: string,
  query: string | undefined,
  limit: number,
): Promise<KnowledgeUnitSearchResult> => query
  ? keywordUnitSearch(viewerProfileId, query, { anchorPersonId, limit })
  : scopedUnitSearch(viewerProfileId, { anchorPersonId, limit })

export const temporalUnitSearch = async (
  viewerProfileId: string,
  since: string,
  until: string,
  limit: number,
): Promise<KnowledgeUnitSearchResult> => scopedUnitSearch(
  viewerProfileId, { since, until, limit },
)

export const getKnowledgeUnitsByIds = async (
  viewerProfileId: string,
  unitIds: readonly string[],
): Promise<KnowledgeUnitSearchResult> => unitIds.length === 0
  ? { outcome: 'success', hits: [] }
  : scopedUnitSearch(viewerProfileId, { unitIds, limit: unitIds.length })
