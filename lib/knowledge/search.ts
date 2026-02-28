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
  connectedTo: string[]       // Graph: related event IDs
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
  connected_to?: string[] | null
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
  connectedTo: row.connected_to ?? [],
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
 * Build a PostgREST .or() filter for two-layer knowledge scoping:
 *   Layer 1: Personal (user_id match, voyage_slug NULL)
 *   Layer 2: Voyage (voyage_slug match, participant-filtered)
 *
 * Used by all direct-query functions to prevent cross-voyage bleed.
 */
export const buildScopeFilter = (userId: string, voyageSlug: string): string =>
  `and(user_id.eq.${userId},voyage_slug.is.null),and(voyage_slug.eq.${voyageSlug},or(participants.is.null,participants.cs.{${userId}}))`

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
      .select('*')
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

/**
 * Get connected knowledge (follow graph edges).
 * Retrieves nodes connected to a given node.
 * When userId is provided, filters out participant-scoped nodes the user can't access.
 */
export const getConnectedKnowledge = async (eventId: string, userId?: string): Promise<KnowledgeNode[]> => {
  try {
    const supabase = getAdminSupabase()

    // Get the node to find its connections
    const { data: node, error: nodeError } = await supabase
      .from('knowledge_current')
      .select('connected_to')
      .eq('event_id', eventId)
      .single()

    if (nodeError || !node) {
      console.error('[Knowledge] getConnectedKnowledge node error:', nodeError)
      return []
    }

    const connectedIds = node.connected_to as string[]
    if (!connectedIds || connectedIds.length === 0) {
      return []
    }

    return getKnowledgeByIds(connectedIds, userId)
  } catch (error) {
    console.error('[Knowledge] getConnectedKnowledge error:', error)
    return []
  }
}

/**
 * Get recent knowledge for a user.
 * Returns recently created knowledge nodes.
 * Two-layer: personal (voyage_slug NULL) + voyage (participant-filtered).
 */
export const getRecentKnowledge = async (
  userId: string,
  limit = 20,
  minAttention = 0.3,
  voyageSlug?: string
): Promise<KnowledgeNode[]> => {
  try {
    const supabase = getClientForUser(userId)

    let query = supabase
      .from('knowledge_current')
      .select('*')
      .gte('attention_score', minAttention)

    if (voyageSlug) {
      query = query.or(buildScopeFilter(userId, voyageSlug))
    } else {
      query = query.eq('user_id', userId).is('voyage_slug', null)
    }

    const { data, error } = await query
      .order('source_created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[Knowledge] getRecentKnowledge error:', error)
      return []
    }

    return (data ?? []).map((row) =>
      transformKnowledgeNode({
        ...row,
        similarity: 1.0,
      } as KnowledgeNodeInput)
    )
  } catch (error) {
    console.error('[Knowledge] getRecentKnowledge error:', error)
    return []
  }
}

/**
 * Get pinned knowledge for a user/voyage.
 * Pinned items are always surfaced.
 * Two-layer: personal (voyage_slug NULL) + voyage (participant-filtered).
 */
export const getPinnedKnowledge = async (
  userId: string,
  voyageSlug?: string
): Promise<KnowledgeNode[]> => {
  try {
    const supabase = getClientForUser(userId)

    let query = supabase
      .from('knowledge_current')
      .select('*')
      .gte('attention_score', 0.9)

    if (voyageSlug) {
      query = query.or(buildScopeFilter(userId, voyageSlug))
    } else {
      query = query.eq('user_id', userId).is('voyage_slug', null)
    }

    const { data, error } = await query.order('attention_score', { ascending: false })

    if (error) {
      console.error('[Knowledge] getPinnedKnowledge error:', error)
      return []
    }

    return (data ?? []).map((row) =>
      transformKnowledgeNode({
        ...row,
        similarity: 1.0,
      } as KnowledgeNodeInput)
    )
  } catch (error) {
    console.error('[Knowledge] getPinnedKnowledge error:', error)
    return []
  }
}

// =============================================================================
// Context Formatting (for prompt injection)
// =============================================================================

/**
 * Format knowledge nodes for prompt injection.
 * Groups by classification and formats as context.
 */
export const formatKnowledgeForPrompt = (nodes: KnowledgeNode[]): string => {
  if (nodes.length === 0) return ''

  // Group by primary classification (first in array)
  const grouped: Record<string, KnowledgeNode[]> = {}
  for (const node of nodes) {
    const primary = node.classifications[0] ?? 'other'
    if (!grouped[primary]) grouped[primary] = []
    grouped[primary].push(node)
  }

  let context = '## Relevant Knowledge\n\n'

  // Order by classification importance
  const classOrder = ['insight', 'decision', 'fact', 'preference', 'procedure', 'entity', 'other']
  const sortedKeys = Object.keys(grouped).sort(
    (a, b) => classOrder.indexOf(a) - classOrder.indexOf(b)
  )

  for (const key of sortedKeys) {
    const items = grouped[key]
    const label = key.charAt(0).toUpperCase() + key.slice(1) + 's'
    context += `### ${label}\n`

    // Sort by attention score within each group
    const sorted = items.sort((a, b) => b.attentionScore - a.attentionScore)
    for (const item of sorted) {
      const pin = item.attentionScore >= 0.9 ? ' [pinned]' : ''
      context += `- ${item.content}${pin}\n`
    }
    context += '\n'
  }

  return context
}

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
      .select('*')
      .filter('content', operator, searchPattern)
      .gte('attention_score', minAttention)

    // Apply scope filters with participant filtering
    if (scope === 'personal') {
      query = query.eq('user_id', userId).is('voyage_slug', null)
    } else if (scope === 'voyage' && voyageSlug) {
      // Voyage only — participant-filtered, no personal layer
      query = query.eq('voyage_slug', voyageSlug)
        .or(`participants.is.null,participants.cs.{${userId}}`)
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
        connectedTo: row.connected_to ?? [],
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

/**
 * Load preference-type knowledge for system prompt injection.
 * Preferences are always loaded into every session — they're part of
 * who Voyager is to this person.
 *
 * @param userId - The user's ID
 * @param voyageSlug - Optional voyage scope
 * @returns Preference knowledge nodes sorted by attention score
 */
export const loadPreferences = async (
  userId: string,
  voyageSlug?: string
): Promise<KnowledgeNode[]> => {
  try {
    const supabase = getAdminSupabase()

    let query = supabase
      .from('knowledge_current')
      .select('*')
      .eq('knowledge_type', 'preference')
      .gte('attention_score', 0.5)

    if (voyageSlug) {
      query = query.or(buildScopeFilter(userId, voyageSlug))
    } else {
      query = query.eq('user_id', userId).is('voyage_slug', null)
    }

    const { data, error } = await query
      .order('attention_score', { ascending: false })

    if (error) {
      console.error('[Knowledge] loadPreferences error:', error)
      return []
    }

    return (data ?? []).map((row) =>
      transformKnowledgeNode({
        ...row,
        similarity: 1.0,
      } as KnowledgeNodeInput)
    )
  } catch (error) {
    console.error('[Knowledge] loadPreferences error:', error)
    return []
  }
}

// =============================================================================
// Awareness Loading (Sentinel-powered, replaces loadPendingMessages)
// =============================================================================

/** Relative time formatting for awareness item display */
const formatTimeAgo = (date: Date): string => {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export interface AwarenessItem {
  type: 'message'
  tier: 'interrupt' | 'weave'
  content: string
  eventId: string
  senderName: string
  timeAgo: string
}

/**
 * Load awareness items for pre-turn surfacing in the system prompt.
 * Queries knowledge_current by delivery_status = 'pending' (D30).
 *
 * Replaces loadPendingMessages — no last_seen_at lookup needed.
 * Results ordered by surfacing tier (interrupt first) then recency.
 * Suppress-tier excluded. NULL surfacing_tier treated as 'weave'.
 *
 * @param userId - The current user's ID
 * @param voyageSlug - Optional voyage scope (returns [] in personal space)
 * @returns Structured AwarenessItem[] for prompt injection + delivery marking
 */
export const loadAwareness = async (
  userId: string,
  voyageSlug?: string
): Promise<AwarenessItem[]> => {
  if (!voyageSlug) return []

  try {
    const supabase = getAdminSupabase()

    // Query pending messages: delivery_status = 'pending', temporal gate passed
    const { data, error } = await supabase
      .from('knowledge_current')
      .select('event_id, content, sender_display_name, source_created_at, surfacing_tier')
      .eq('event_type', 'message')
      .eq('voyage_slug', voyageSlug)
      .contains('addressed_to', [userId])
      .neq('sender_user_id', userId)
      .eq('delivery_status', 'pending')
      .gte('attention_score', 0.5)
      .or('deliver_after.is.null,deliver_after.lte.now()')
      .order('source_created_at', { ascending: false })
      .limit(10)

    if (error || !data || data.length === 0) return []

    // Map rows to AwarenessItem[], excluding suppress-tier
    const items: AwarenessItem[] = data
      .filter(row => (row.surfacing_tier as string) !== 'suppress')
      .map(row => ({
        type: 'message' as const,
        tier: (row.surfacing_tier as string) === 'interrupt' ? 'interrupt' as const : 'weave' as const,
        content: row.content as string,
        eventId: row.event_id as string,
        senderName: (row.sender_display_name as string) ?? 'Someone',
        timeAgo: formatTimeAgo(new Date(row.source_created_at as string)),
      }))

    // Sort: interrupt first, then weave, then by recency (already DESC from query)
    items.sort((a, b) => {
      if (a.tier === 'interrupt' && b.tier !== 'interrupt') return -1
      if (a.tier !== 'interrupt' && b.tier === 'interrupt') return 1
      return 0  // Preserve recency order from query
    })

    return items
  } catch (error) {
    console.error('[Knowledge] loadAwareness error:', error)
    return []
  }
}

// =============================================================================
// Pending Message Loading (DEPRECATED — use loadAwareness)
// =============================================================================

/**
 * @deprecated Use loadAwareness() instead. This function uses last_seen_at
 * which is replaced by per-message delivery_status (D30).
 * Kept for backward compatibility during transition.
 */
export const loadPendingMessages = async (
  userId: string,
  voyageSlug?: string
): Promise<string[]> => {
  // No messages in personal space — no voyage membership to track
  if (!voyageSlug) return []

  try {
    const supabase = getAdminSupabase()

    // Resolve voyage_id from slug
    const { data: voyage, error: voyageError } = await supabase
      .from('voyages')
      .select('id')
      .eq('slug', voyageSlug)
      .single()

    if (voyageError || !voyage) return []

    // Look up membership + last_seen_at
    const { data: membership, error: memberError } = await supabase
      .from('voyage_members')
      .select('last_seen_at')
      .eq('user_id', userId)
      .eq('voyage_id', voyage.id)
      .single()

    if (memberError || !membership) return []

    // Default to 24h ago if never seen (first session)
    const lastSeen = membership.last_seen_at
      ? new Date(membership.last_seen_at as string)
      : new Date(Date.now() - 24 * 60 * 60 * 1000)

    // Query pending messages: direct mentions since last seen
    const { data: messages, error } = await supabase
      .from('knowledge_current')
      .select('sender_display_name, source_created_at, content')
      .eq('event_type', 'message')
      .eq('voyage_slug', voyageSlug)
      .contains('addressed_to', [userId])
      .neq('sender_user_id', userId)
      .gte('attention_score', 0.5)
      .gt('source_created_at', lastSeen.toISOString())
      .order('source_created_at', { ascending: false })
      .limit(5)

    if (error || !messages || messages.length === 0) return []

    console.log(`[Knowledge] ${messages.length} pending message(s) for user`)

    return messages.map(m => {
      const sender = (m.sender_display_name as string) ?? 'Someone'
      const time = formatTimeAgo(new Date(m.source_created_at as string))
      const content = (m.content as string) ?? ''
      const preview = content.length > 60 ? content.slice(0, 60) + '...' : content
      return `${sender} (${time}): ${preview}`
    })
  } catch (error) {
    console.error('[Knowledge] loadPendingMessages error:', error)
    return []
  }
}

// =============================================================================
// Exports
// =============================================================================

export type { Classification }
