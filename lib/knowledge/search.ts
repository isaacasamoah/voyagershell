// Knowledge Search service
// Semantic search over the event-sourced knowledge system
//
// Philosophy: "Curation is subtraction, not extraction"
// - Searches knowledge_current (computed state from source events)
// - attention_score is the SINGLE canonical attention field
// - High attention (>= 0.9) = pinned / always surfaced

import OpenAI from 'openai'
import { getClientForContext } from '@/lib/supabase/authenticated'
import { getAdminClient } from '@/lib/supabase/admin'
import type { Classification } from './events'

// Use authenticated client for user-scoped knowledge operations
const getClientForUser = (userId: string) => getClientForContext({ userId })

// Admin client for cross-user operations (legacy - functions without userId context)
const getAdminSupabase = () => getAdminClient()

// Lazy-initialize OpenAI client to avoid build-time errors
let _openai: OpenAI | null = null
const getOpenAI = (): OpenAI => {
  if (!_openai) {
    _openai = new OpenAI()
  }
  return _openai
}

// =============================================================================
// Types (matching 010_knowledge_events.sql schema)
// =============================================================================

/**
 * A knowledge node from knowledge_current.
 * Represents a source event with computed attention state.
 */
export interface KnowledgeNode {
  eventId: string             // Source event ID (primary key)
  content: string             // THE ACTUAL KNOWLEDGE (preserved exactly)
  classifications: string[]   // Metadata: fact, decision, preference, etc.
  entities: string[]          // Metadata: people, systems, projects
  topics: string[]            // Metadata: domain topics
  createdAt: Date             // When the source event was created
  similarity?: number         // Search relevance score
  knowledgeType: string | null   // domain | operational | preference (NULL = treat as operational)
  attentionScore: number         // 0.0-1.0 continuous (single canonical attention field)
  contextSnippet: string | null  // One-line contextualisation for re-embedding
  // V6: Message attribution + type (denormalized columns on knowledge_current)
  senderDisplayName?: string     // Human-readable sender name
  senderUserId?: string          // Sender UUID
  eventType?: string             // Container: message | document | slack_message | etc.
}

export interface SearchOptions {
  /** Minimum similarity threshold (0-1). Default: 0.6 */
  threshold?: number
  /** Maximum results to return. Default: 20 */
  limit?: number
  /** Filter by classification types */
  classifications?: Classification[]
  /** Filter by voyage slug */
  voyageSlug?: string
  /** Filter by knowledge type: domain | operational | preference */
  knowledgeType?: string
  /** Minimum attention score (0-1). Default: 0.0 */
  minAttention?: number
}

// Input type for transformKnowledgeNode — works with both RPC results and direct table rows.
interface KnowledgeNodeInput {
  event_id: string
  content: string
  source_created_at: string
  classifications?: string[] | null
  entities?: string[] | null
  topics?: string[] | null
  participants?: string[] | null
  similarity?: number
  knowledge_type?: string | null
  attention_score?: number | null
  context_snippet?: string | null
  // V6: denormalized columns
  sender_display_name?: string | null
  sender_user_id?: string | null
  event_type?: string | null
}

// =============================================================================
// Embedding Generation
// =============================================================================

const generateEmbedding = async (text: string): Promise<number[]> => {
  const openai = getOpenAI()
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return response.data[0].embedding
}

const toVectorString = (embedding: number[]): string => {
  return `[${embedding.join(',')}]`
}

// =============================================================================
// Transform Functions
// =============================================================================

const transformKnowledgeNode = (row: KnowledgeNodeInput): KnowledgeNode => ({
  eventId: row.event_id,
  content: row.content,
  classifications: row.classifications ?? [],
  entities: row.entities ?? [],
  topics: row.topics ?? [],
  createdAt: new Date(row.source_created_at),
  similarity: row.similarity,
  knowledgeType: row.knowledge_type ?? null,
  attentionScore: row.attention_score ?? 0.5,
  contextSnippet: row.context_snippet ?? null,
  // V6: message attribution from denormalized columns
  senderDisplayName: row.sender_display_name ?? undefined,
  senderUserId: row.sender_user_id ?? undefined,
  eventType: row.event_type ?? undefined,
})

// =============================================================================
// Scope Filters (PostgREST two-layer pattern)
// =============================================================================

/**
 * Build a PostgREST .or() filter for 4-layer privacy-scoped knowledge retrieval:
 *   Layer 1: Personal space — user_id = me AND voyage_slug IS NULL
 *   Layer 2: My voyage content — voyage_slug = X AND user_id = me
 *   Layer 3: Shared explicit — voyage_slug = X AND event_type = 'explicit' AND knowledge_type IN ('domain', 'operational')
 *   Layer 4: My messages — voyage_slug = X AND event_type = 'message' AND participants contains me
 *
 * Privacy invariant: event_type is the stable privacy dimension.
 * - conversation events are ALWAYS author-only (covered by Layer 2)
 * - explicit events with knowledge_type domain/operational are voyage-wide (Layer 3)
 * - explicit events with knowledge_type preference or NULL are author-only (Layer 2)
 * - message events are participant-scoped (Layer 4)
 *
 * Used by all direct-query functions. Same signature, privacy-aware internals.
 */
export const buildScopeFilter = (userId: string, voyageSlug: string): string =>
  [
    // Layer 1: Personal space (no voyage)
    `and(user_id.eq.${userId},voyage_slug.is.null)`,
    // Layer 2: My own content in this voyage (conversations, preferences, unenriched)
    `and(voyage_slug.eq.${voyageSlug},user_id.eq.${userId})`,
    // Layer 3: Shared explicit domain/operational from any member
    `and(voyage_slug.eq.${voyageSlug},event_type.eq.explicit,knowledge_type.in.(domain,operational))`,
    // Layer 4: Messages where I'm a participant
    `and(voyage_slug.eq.${voyageSlug},event_type.eq.message,or(participants.is.null,participants.cs.{${userId}}))`,
  ].join(',')

// =============================================================================
// Search Functions
// =============================================================================

/**
 * Search knowledge by semantic similarity.
 * Queries the knowledge_current table (computed state from source events).
 *
 * @param userId - The user's ID (for personal knowledge scope)
 * @param query - The search query text
 * @param options - Search options (threshold, limit, filters)
 * @returns Array of matching knowledge nodes with similarity scores
 */
export const searchKnowledge = async (
  userId: string,
  query: string,
  options: SearchOptions = {}
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
      `[Knowledge] Search: "${query.slice(0, 50)}..." threshold: ${threshold}, limit: ${limit}, type: ${knowledgeType ?? 'all'}, minAttention: ${minAttention}`
    )

    const supabase = getClientForUser(userId)

    // Generate embedding for the query
    const embedding = await generateEmbedding(query)

    // Call the RPC function for semantic search
    // 'operational' type filter is client-side (includes null knowledge_type rows)
    const rpcKnowledgeType = (knowledgeType && knowledgeType !== 'operational') ? knowledgeType : undefined

    const { data, error } = await supabase.rpc('search_knowledge', {
      query_embedding: toVectorString(embedding),
      p_user_id: userId,
      p_voyage_slug: voyageSlug,
      p_classifications: classifications as string[] | undefined,
      p_match_threshold: threshold,
      p_match_count: limit,
      p_knowledge_type: rpcKnowledgeType,
      p_min_attention: minAttention,
      p_participants: [userId],
    })

    if (error) {
      console.error('[Knowledge] Search error:', error)
      return []
    }

    let results = ((data ?? []) as KnowledgeNodeInput[])

    // Client-side filter for 'operational' — includes unclassified (null) rows
    if (knowledgeType === 'operational') {
      results = results.filter(
        (r) => r.knowledge_type === null || r.knowledge_type === 'operational'
      )
    }

    console.log(`[Knowledge] Found ${results.length} results`)
    if (results.length > 0 && results.length <= 5) {
      results.forEach((r) =>
        console.log(
          `  - ${r.content.slice(0, 50)}... (sim: ${r.similarity?.toFixed(3) ?? '-'}, attn: ${r.attention_score ?? '-'})`
        )
      )
    }

    return results.map(transformKnowledgeNode)
  } catch (error) {
    console.error('[Knowledge] searchKnowledge error:', error)
    return []
  }
}

/**
 * Get knowledge by specific event IDs.
 * Useful for following graph edges or getting context for specific nodes.
 * When userId is provided, filters out participant-scoped nodes the user can't access.
 */
export const getKnowledgeByIds = async (eventIds: string[], userId?: string): Promise<KnowledgeNode[]> => {
  if (eventIds.length === 0) return []

  try {
    const supabase = getAdminSupabase()

    let query = supabase
      .from('knowledge_current')
      .select('event_id, content, source_created_at, classifications, entities, topics, knowledge_type, attention_score, context_snippet, sender_display_name, sender_user_id, event_type')
      .in('event_id', eventIds)

    // Participant filter: only return nodes the user can access
    if (userId) {
      query = query.or(`participants.is.null,participants.cs.{${userId}}`)
    }

    const { data, error } = await query

    if (error) {
      console.error('[Knowledge] getKnowledgeByIds error:', error)
      return []
    }

    return (data ?? []).map((row) =>
      transformKnowledgeNode({
        ...row,
        similarity: 1.0,
      } as KnowledgeNodeInput)
    )
  } catch (error) {
    console.error('[Knowledge] getKnowledgeByIds error:', error)
    return []
  }
}

// =============================================================================
// Context Formatting (for prompt injection)
// =============================================================================

// =============================================================================
// Keyword Grep (Exact Match Search)
// =============================================================================

export interface GrepOptions {
  /** Search scope. Default: 'all' */
  scope?: 'personal' | 'voyage' | 'all'
  /** Case sensitive match. Default: false */
  caseSensitive?: boolean
  /** Maximum results. Default: 20 */
  limit?: number
  /** Filter by voyage slug */
  voyageSlug?: string
  /** Minimum attention score threshold. Default: 0.3 */
  minAttention?: number
}

export interface GrepResult extends Omit<KnowledgeNode, 'similarity'> {
  /** Highlighted excerpt showing match context */
  highlight: string
  /** Match position in content */
  matchStart: number
}

/**
 * Exact keyword/phrase search across knowledge.
 * Use for precise matching when you know the exact terms.
 * Returns matches with surrounding context.
 *
 * @param userId - The user's ID (for personal knowledge scope)
 * @param pattern - Exact phrase or keyword to find
 * @param options - Search options
 * @returns Array of matching nodes with highlights
 */
export const keywordGrep = async (
  userId: string,
  pattern: string,
  options: GrepOptions = {}
): Promise<GrepResult[]> => {
  const {
    scope = 'all',
    caseSensitive = false,
    limit = 20,
    voyageSlug,
    minAttention = 0.3,
  } = options

  if (!pattern.trim()) {
    return []
  }

  try {
    console.log(
      `[Knowledge] Grep: "${pattern}" scope: ${scope}, case: ${caseSensitive}, limit: ${limit}, minAttention: ${minAttention}`
    )

    const supabase = getClientForUser(userId)

    // Build the query - using ILIKE for case-insensitive, LIKE for case-sensitive
    const operator = caseSensitive ? 'like' : 'ilike'
    const searchPattern = `%${pattern}%`


    let query = supabase
      .from('knowledge_current')
      .select('event_id, content, source_created_at, classifications, entities, topics, knowledge_type, attention_score, context_snippet, sender_display_name, sender_user_id, event_type')
      .filter('content', operator, searchPattern)
      .gte('attention_score', minAttention)

    // Apply scope filters — all voyage paths use buildScopeFilter for privacy
    if (scope === 'personal') {
      query = query.eq('user_id', userId).is('voyage_slug', null)
    } else if (scope === 'voyage' && voyageSlug) {
      // Voyage only — privacy-scoped, exclude personal layer
      query = query.or(buildScopeFilter(userId, voyageSlug))
        .not('voyage_slug', 'is', null)
    } else if (voyageSlug) {
      query = query.or(buildScopeFilter(userId, voyageSlug))
    } else {
      query = query.eq('user_id', userId).is('voyage_slug', null)
    }

    const { data, error } = await query
      .order('attention_score', { ascending: false })
      .order('source_created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[Knowledge] Grep error:', error)
      return []
    }

    const results = (data ?? []) as KnowledgeNodeInput[]

    console.log(`[Knowledge] Grep found ${results.length} matches`)

    // Transform results and add highlights
    return results.map((row) => {
      const content = row.content
      const lowerContent = caseSensitive ? content : content.toLowerCase()
      const lowerPattern = caseSensitive ? pattern : pattern.toLowerCase()
      const matchStart = lowerContent.indexOf(lowerPattern)

      // Create highlight with context (50 chars before/after)
      const start = Math.max(0, matchStart - 50)
      const end = Math.min(content.length, matchStart + pattern.length + 50)
      let highlight = content.slice(start, end)
      if (start > 0) highlight = '...' + highlight
      if (end < content.length) highlight = highlight + '...'

      return {
        eventId: row.event_id,
        content: row.content,
        classifications: row.classifications ?? [],
        entities: row.entities ?? [],
        topics: row.topics ?? [],
        createdAt: new Date(row.source_created_at),
        knowledgeType: row.knowledge_type ?? null,
        attentionScore: row.attention_score ?? 0.5,
        contextSnippet: row.context_snippet ?? null,
        highlight,
        matchStart,
      }
    })
  } catch (error) {
    console.error('[Knowledge] keywordGrep error:', error)
    return []
  }
}

// =============================================================================
// Preference Loading (for system prompt injection)
// =============================================================================

// =============================================================================
// (message awareness lane removed in v2 — messages deliver on the wire)
// =============================================================================

export type { Classification }
