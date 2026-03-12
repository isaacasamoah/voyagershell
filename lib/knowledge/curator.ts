// Knowledge Curator — Token-Budgeted Prompt Window
// Replaces getPinnedKnowledge() + loadPreferences() with a single
// tier-aware query that enforces hard token budgets.
//
// Three tiers:
//   preferences  — "What I Know About You" (knowledge_type = 'preference', attn >= 0.5)
//   operational  — "What's Happening Now" (knowledge_type IN ('operational', NULL), attn >= 0.3)
//   domain       — "Domain Context" (knowledge_type = 'domain', attn >= 0.3, headlines only)
//
// Each tier has its own token budget. Tiers are isolated —
// preferences are never evicted by operational overflow.

import { getAdminClient } from '@/lib/supabase/admin'
import { estimateTokens } from '@/lib/conversation/window'
import { buildScopeFilter, type KnowledgeNode } from './search'

// =============================================================================
// Types
// =============================================================================

export interface PromptWindowConfig {
  totalBudget: number
  tiers: {
    preferences: number
    operational: number
    domainHeadlines: number
  }
  /** Number of recent sessions to include for operational tier (default: 2 + current) */
  operationalSessionWindow: number
}

export interface CuratedWindow {
  preferences: KnowledgeNode[]
  operational: KnowledgeNode[]
  domainHeadlines: KnowledgeNode[]
  totalTokens: number
  evictedCount: number
}

export const DEFAULT_WINDOW_CONFIG: PromptWindowConfig = {
  totalBudget: 4000,
  tiers: {
    preferences: 1200,
    operational: 2000,
    domainHeadlines: 800,
  },
  operationalSessionWindow: 2,
}

// =============================================================================
// Row → KnowledgeNode transform (inline to avoid circular dep with search.ts)
// =============================================================================

interface CuratorRow {
  event_id: string
  content: string
  knowledge_type: string | null
  attention_score: number | null
  context_snippet: string | null
  source_created_at: string
  classifications: string[] | null
  entities: string[] | null
  topics: string[] | null
  connected_to: string[] | null
  sender_display_name?: string | null
  sender_user_id?: string | null
  event_type?: string | null
  promotion_count?: number | null
}

/**
 * Compute effective attention: base + promotion boost, capped at 1.0.
 * F4.4: effective_attention = base_attention + (0.05 * promotion_count)
 */
const effectiveAttention = (row: CuratorRow): number => {
  const base = row.attention_score ?? 0.5
  const promotions = row.promotion_count ?? 0
  return Math.min(base + 0.05 * promotions, 1.0)
}

const toNode = (row: CuratorRow): KnowledgeNode => ({
  eventId: row.event_id,
  content: row.content,
  classifications: row.classifications ?? [],
  entities: row.entities ?? [],
  topics: row.topics ?? [],
  connectedTo: row.connected_to ?? [],
  createdAt: new Date(row.source_created_at),
  knowledgeType: row.knowledge_type ?? null,
  attentionScore: effectiveAttention(row), // F4.4: includes promotion boost
  contextSnippet: row.context_snippet ?? null,
  senderDisplayName: row.sender_display_name ?? undefined,
  senderUserId: row.sender_user_id ?? undefined,
  eventType: row.event_type ?? undefined,
})

// =============================================================================
// Token-budgeted fill — greedily fill a tier until budget is exhausted
// =============================================================================

const fillTier = (
  rows: CuratorRow[],
  budget: number,
): { nodes: KnowledgeNode[]; tokensUsed: number; evicted: number } => {
  const nodes: KnowledgeNode[] = []
  let tokensUsed = 0
  let evicted = 0

  for (const row of rows) {
    const text = row.context_snippet ?? row.content
    const tokens = estimateTokens(text)

    if (tokensUsed + tokens > budget) {
      evicted++
      continue
    }

    tokensUsed += tokens
    nodes.push(toNode(row))
  }

  return { nodes, tokensUsed, evicted }
}

// =============================================================================
// Main entry point
// =============================================================================

/**
 * Get the N most recent session IDs for a user from session_index.
 * Returns a Set for O(1) lookup. Includes currentSessionId even if
 * not yet in the index.
 */
const getRecentSessionIds = async (
  userId: string,
  currentSessionId: string | undefined,
  windowSize: number,
): Promise<Set<string> | null> => {
  if (!currentSessionId) return null // no filtering without a session anchor

  const supabase = getAdminClient()

  // session_index not in generated Supabase types yet — cast through
  const { data, error } = await (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> })
    .from('session_index')
    .select('session_id')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(windowSize + 1) // +1 to include current

  if (error || !data) return null

  const sessionIds = new Set<string>()
  for (const row of data) {
    sessionIds.add((row as Record<string, unknown>).session_id as string)
  }
  // Ensure current session is always included
  sessionIds.add(currentSessionId)

  return sessionIds
}

/**
 * Curate a token-budgeted prompt window from knowledge_current.
 * Single SQL query, tier-aware ranking, hard budget enforcement.
 *
 * Performance target: < 50ms (pure SQL, no LLM calls).
 */
export const curatePromptWindow = async (
  userId: string,
  voyageSlug?: string,
  config: PromptWindowConfig = DEFAULT_WINDOW_CONFIG,
  sessionId?: string,
): Promise<CuratedWindow> => {
  const supabase = getAdminClient()

  // Parallel: fetch knowledge candidates + recent session IDs for operational filtering
  const [knowledgeResult, recentSessions] = await Promise.all([
    (async () => {
      let query = supabase
        .from('knowledge_current')
        .select('event_id, content, knowledge_type, attention_score, context_snippet, source_created_at, classifications, entities, topics, connected_to, sender_display_name, sender_user_id, event_type, session_id, promotion_count')
        .gte('attention_score', 0.3)

      if (voyageSlug) {
        query = query.or(buildScopeFilter(userId, voyageSlug))
      } else {
        query = query.eq('user_id', userId).is('voyage_slug', null)
      }

      return query
        .order('attention_score', { ascending: false })
        .order('source_created_at', { ascending: false })
        .limit(500)
    })(),
    getRecentSessionIds(userId, sessionId, config.operationalSessionWindow),
  ])

  if (knowledgeResult.error || !knowledgeResult.data) {
    console.warn('[Curator] Query failed:', knowledgeResult.error?.message)
    return { preferences: [], operational: [], domainHeadlines: [], totalTokens: 0, evictedCount: 0 }
  }

  // Cast through unknown: promotion_count + session_id not in generated Supabase types yet
  const rawRows = knowledgeResult.data as unknown as (CuratorRow & { session_id?: string | null })[]

  // Sort by effective attention (includes promotion boost) then recency (F4.4)
  const rows = rawRows.sort((a, b) => {
    const diff = effectiveAttention(b) - effectiveAttention(a)
    if (diff !== 0) return diff
    return new Date(b.source_created_at).getTime() - new Date(a.source_created_at).getTime()
  })

  // Split into tier buckets
  const prefRows = rows.filter(r => r.knowledge_type === 'preference' && effectiveAttention(r) >= 0.5)
  const domainRows = rows.filter(r => r.knowledge_type === 'domain')

  // Operational tier: filter by session recency when session context is available
  const opCandidates = rows.filter(r => r.knowledge_type === 'operational' || r.knowledge_type === null)
  const opRows = recentSessions
    ? opCandidates.filter(r => {
        // Include if session matches recent window, or if no session_id (non-session knowledge)
        if (!r.session_id) return true
        return recentSessions.has(r.session_id)
      })
    : opCandidates // no session filtering if no sessionId provided

  // Fill each tier independently (tier isolation)
  const prefs = fillTier(prefRows, config.tiers.preferences)
  const ops = fillTier(opRows, config.tiers.operational)
  const domain = fillTier(domainRows, config.tiers.domainHeadlines)

  return {
    preferences: prefs.nodes,
    operational: ops.nodes,
    domainHeadlines: domain.nodes,
    totalTokens: prefs.tokensUsed + ops.tokensUsed + domain.tokensUsed,
    evictedCount: prefs.evicted + ops.evicted + domain.evicted,
  }
}
