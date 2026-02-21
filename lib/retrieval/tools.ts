// Retrieval Tools for Agentic Search
// Voyager decides how to retrieve - not a fixed pipeline, intelligence
//
// Philosophy: Chain strategies for pinpoint accuracy
// semantic_search → found topic → get_connected → keyword_grep
//
// These tools are executed by Claude during response generation
// using Vercel AI SDK's tool calling capability.

import { tool } from 'ai'
import { z } from 'zod'
import {
  searchKnowledge,
  keywordGrep,
  getConnectedKnowledge,
  getKnowledgeByIds,
  type KnowledgeNode,
  type GrepResult,
} from '@/lib/knowledge'
import { getClientForContext } from '@/lib/supabase/authenticated'
import { enqueueAgentTask, completeTask, failTask } from '@/lib/agents/queue'
import { createCaptainTools } from '@/lib/tools/captain'

// Resolve short ID (8 chars) to full UUID
const resolveNodeId = async (shortOrFullId: string, ctx: ToolContext): Promise<string | null> => {
  // If it's already a full UUID (36 chars with dashes), return as-is
  if (shortOrFullId.length === 36 && shortOrFullId.includes('-')) {
    return shortOrFullId
  }

  // Otherwise, look up by prefix (scoped to user via RLS)
  const supabase = getClientForContext({ userId: ctx.userId })

  const { data } = await (supabase as any)
    .from('knowledge_current')
    .select('event_id')
    .ilike('event_id', `${shortOrFullId}%`)
    .limit(1)
    .single()

  return (data as { event_id: string } | null)?.event_id ?? null
}

// =============================================================================
// Tool Context (passed to tool executors)
// =============================================================================

export interface ToolContext {
  userId: string
  voyageSlug?: string
  conversationId?: string
  /** Vercel waitUntil for background execution without blocking response */
  waitUntil?: (promise: Promise<unknown>) => void
  /** Conversation messages for context capture (used by spawn_background_agent) */
  messages?: Array<{ role: string; content: string }>
}

// =============================================================================
// Result Formatters
// =============================================================================

const formatKnowledgeResult = (nodes: KnowledgeNode[]): string => {
  if (nodes.length === 0) {
    return 'No results found.'
  }

  return nodes
    .map((node, i) => {
      const shortId = node.eventId.slice(0, 8) // Short ID for readability
      const pinned = node.attentionScore >= 0.9 ? ' [PINNED]' : ''
      const similarity = node.similarity ? ` (${(node.similarity * 100).toFixed(0)}%)` : ''
      const connected = node.connectedTo?.length ? ` [${node.connectedTo.length} connections]` : ''
      return `[${i + 1}] id:${shortId}${pinned}${similarity}${connected}\n${node.content}`
    })
    .join('\n\n')
}

const formatGrepResult = (results: GrepResult[]): string => {
  if (results.length === 0) {
    return 'No exact matches found.'
  }

  return results
    .map((r, i) => {
      const shortId = r.eventId.slice(0, 8)
      const pinned = r.attentionScore >= 0.9 ? ' [PINNED]' : ''
      const connected = r.connectedTo?.length ? ` [${r.connectedTo.length} connections]` : ''
      return `[${i + 1}] id:${shortId}${pinned}${connected}\n...${r.highlight}...`
    })
    .join('\n\n')
}

// =============================================================================
// Input Schemas (Zod)
// =============================================================================

const semanticSearchSchema = z.object({
  query: z.string().describe('The semantic search query'),
  limit: z.number().optional().default(10).describe('Max results (1-20)'),
  threshold: z.number().optional().default(0.6).describe('Min similarity (0-1)'),
})

const keywordGrepSchema = z.object({
  pattern: z.string().describe('Exact phrase or keyword to find'),
  caseSensitive: z.boolean().optional().default(false),
  limit: z.number().optional().default(10).describe('Max results'),
})

const getConnectedSchema = z.object({
  nodeId: z.string().describe('The event ID (or first 8 chars) from search results, e.g. "abc12345"'),
})

const getNodesSchema = z.object({
  nodeIds: z.array(z.string()).describe('Array of event IDs to retrieve'),
})

const searchByTimeSchema = z.object({
  since: z.string().describe('Start date: ISO string (2024-01-15) or relative (yesterday, last week, 3 days ago)'),
  until: z.string().optional().describe('End date: ISO string or relative. Defaults to now.'),
  query: z.string().optional().describe('Optional semantic query to filter results'),
  limit: z.number().optional().default(15).describe('Max results'),
})

const spawnBackgroundAgentSchema = z.object({
  objective: z.string().describe('What to find or research. Be specific about the topic, time range, or scope.'),
  context: z.string().optional().describe('Relevant context from the conversation to help guide the search.'),
  priority: z.enum(['low', 'normal', 'high']).optional().default('normal'),
})

const webSearchSchema = z.object({
  query: z.string().describe('Search query for the web'),
  recency: z.enum(['day', 'week', 'month', 'any']).optional().default('any').describe('How recent should results be'),
})

// =============================================================================
// Time Parsing Helper
// =============================================================================

const parseRelativeDate = (input: string): Date => {
  const now = new Date()
  const lower = input.toLowerCase().trim()

  // Check for ISO date format first
  if (/^\d{4}-\d{2}-\d{2}/.test(lower)) {
    return new Date(input)
  }

  // Relative date parsing
  if (lower === 'today') return new Date(now.setHours(0, 0, 0, 0))
  if (lower === 'yesterday') return new Date(now.setDate(now.getDate() - 1))
  if (lower === 'last week') return new Date(now.setDate(now.getDate() - 7))
  if (lower === 'last month') return new Date(now.setMonth(now.getMonth() - 1))

  // Parse "X days/weeks ago"
  const agoMatch = lower.match(/(\d+)\s*(day|week|month|hour)s?\s*ago/)
  if (agoMatch) {
    const amount = parseInt(agoMatch[1])
    const unit = agoMatch[2]
    if (unit === 'day') return new Date(now.setDate(now.getDate() - amount))
    if (unit === 'week') return new Date(now.setDate(now.getDate() - amount * 7))
    if (unit === 'month') return new Date(now.setMonth(now.getMonth() - amount))
    if (unit === 'hour') return new Date(now.setHours(now.getHours() - amount))
  }

  // Default to 7 days ago if parsing fails
  return new Date(now.setDate(now.getDate() - 7))
}

// =============================================================================
// Tool Definitions
// =============================================================================

/**
 * Creates the retrieval tools bound to a specific context.
 * Call this in the chat route to get executable tools for the request.
 */
export const createRetrievalTools = (ctx: ToolContext) => ({
  semantic_search: tool({
    description: `Semantic search across the knowledge base. Finds content by conceptual similarity to the query. Returns results ranked by relevance with similarity scores. Example queries: "pricing discussions", "onboarding decisions", "what we know about React performance".`,
    inputSchema: semanticSearchSchema,
    execute: async (input) => {
      const { query, limit, threshold } = input
      const results = await searchKnowledge(ctx.userId, query, {
        threshold,
        limit: Math.min(limit, 20),
        voyageSlug: ctx.voyageSlug,
      })
      const formatted = formatKnowledgeResult(results)
      return formatted
    },
  }),

  keyword_grep: tool({
    description: `Exact keyword or phrase search across the knowledge base. Returns matches with highlighted context around the match. Example patterns: "React 19", "pricing tier", a person's name, a specific term or quote.`,
    inputSchema: keywordGrepSchema,
    execute: async (input) => {
      const { pattern, caseSensitive, limit } = input
      const results = await keywordGrep(ctx.userId, pattern, {
        caseSensitive,
        limit: Math.min(limit, 20),
        voyageSlug: ctx.voyageSlug,
      })
      return formatGrepResult(results)
    },
  }),

  get_connected: tool({
    description: `Retrieve knowledge nodes connected to a given node via graph edges (supports, contradicts, supersedes). Takes a node ID from search results (e.g. "abc12345"). Returns all directly connected nodes.`,
    inputSchema: getConnectedSchema,
    execute: async (input) => {
      const { nodeId } = input
      const fullId = await resolveNodeId(nodeId, ctx)
      if (!fullId) {
        return `No node found matching ID "${nodeId}"`
      }
      const results = await getConnectedKnowledge(fullId)
      if (results.length === 0) {
        return `Node ${nodeId} has no connections yet.`
      }
      return formatKnowledgeResult(results)
    },
  }),

  get_nodes: tool({
    description: `Retrieve specific knowledge nodes by their event IDs. Returns full node content and metadata for each requested ID.`,
    inputSchema: getNodesSchema,
    execute: async (input) => {
      const { nodeIds } = input
      const results = await getKnowledgeByIds(nodeIds)
      return formatKnowledgeResult(results)
    },
  }),

  search_by_time: tool({
    description: `Search knowledge by time range. Returns items from the specified period, newest first. Supports ISO dates (2024-01-15) and relative dates (yesterday, last week, 3 days ago). Optional semantic query to filter within the time range.`,
    inputSchema: searchByTimeSchema,
    execute: async (input) => {
      const { since, until, query, limit } = input
      const sinceDate = parseRelativeDate(since)
      const untilDate = until ? parseRelativeDate(until) : new Date()

      const supabase = getClientForContext({ userId: ctx.userId })

      let dbQuery = (supabase as any)
        .from('knowledge_current')
        .select('*')
        .gte('attention_score', 0)
        .gte('source_created_at', sinceDate.toISOString())
        .lte('source_created_at', untilDate.toISOString())
        .order('source_created_at', { ascending: false })
        .limit(Math.min(limit, 30))

      // Scope to user/voyage
      if (ctx.voyageSlug) {
        dbQuery = dbQuery.or(`user_id.eq.${ctx.userId},voyage_slug.eq.${ctx.voyageSlug}`)
      } else {
        dbQuery = dbQuery.eq('user_id', ctx.userId)
      }

      const { data, error } = await dbQuery

      if (error) {
        return `Error searching by time: ${error.message}`
      }

      if (!data || data.length === 0) {
        return `No knowledge found between ${sinceDate.toLocaleDateString()} and ${untilDate.toLocaleDateString()}.`
      }

      // Transform to KnowledgeNode format
      const results: KnowledgeNode[] = data.map((row: Record<string, unknown>) => ({
        eventId: row.event_id as string,
        content: row.content as string,
        classifications: (row.classifications as string[]) ?? [],
        entities: (row.entities as string[]) ?? [],
        topics: (row.topics as string[]) ?? [],
        connectedTo: (row.connected_to as string[]) ?? [],
        createdAt: new Date(row.source_created_at as string),
        knowledgeType: (row.knowledge_type as string | null) ?? null,
        attentionScore: (row.attention_score as number) ?? 0.5,
        contextSnippet: (row.context_snippet as string | null) ?? null,
      }))

      // If query provided, could filter semantically here (future enhancement)
      const header = `Found ${results.length} items from ${sinceDate.toLocaleDateString()} to ${untilDate.toLocaleDateString()}:\n\n`
      return header + formatKnowledgeResult(results)
    },
  }),

  spawn_background_agent: tool({
    description: `Spawn a background agent for deep asynchronous research. The agent has full access to retrieval tools and works independently. Results surface via realtime when complete. Suitable for comprehensive multi-topic searches or research spanning long time periods.`,
    inputSchema: spawnBackgroundAgentSchema,
    execute: async (input) => {
      const { objective, context, priority } = input

      // Validate we have a conversation context
      if (!ctx.conversationId) {
        return 'Cannot spawn background agent: no conversation context'
      }

      try {
        // Capture original query (last user message) and conversation snapshot
        const lastUserMessage = ctx.messages
          ?.filter((m) => m.role === 'user')
          .pop()?.content
        const conversationSnapshot = ctx.messages?.slice(-20) // Cap at 20 messages

        // Enqueue task (for audit trail + UI tracking)
        const taskId = await enqueueAgentTask({
          task: objective,
          code: '', // Background agent generates its own strategy
          priority: priority ?? 'normal',
          userId: ctx.userId,
          voyageSlug: ctx.voyageSlug,
          conversationId: ctx.conversationId,
          originalQuery: lastUserMessage,
          conversationSnapshot,
        })

        // Execute immediately via waitUntil (non-blocking)
        // Results surface via Realtime
        if (ctx.waitUntil) {
          const executeTask = async () => {
            const startTime = Date.now()
            try {
              // Import and run the background retrieval agent
              const { runBackgroundRetrieval } = await import('@/lib/agents/deep-retrieval')
              const result = await runBackgroundRetrieval({
                taskId,
                objective,
                context: context ?? '',
                userId: ctx.userId,
                voyageSlug: ctx.voyageSlug,
                conversationId: ctx.conversationId!,
              })
              await completeTask(taskId, result, Date.now() - startTime, {
                conversationId: ctx.conversationId,
                userId: ctx.userId,
              })
              console.log(`[spawn_background_agent] Task ${taskId.slice(0, 8)} completed: ${result.findings.length} findings`)
            } catch (error) {
              await failTask(taskId, error instanceof Error ? error.message : 'Unknown error')
              console.error(`[spawn_background_agent] Task ${taskId.slice(0, 8)} failed:`, error)
            }
          }
          ctx.waitUntil(executeTask())
        }

        return `Background search started for "${objective.slice(0, 50)}...". Findings will surface when ready.`
      } catch (error) {
        console.error('[spawn_background_agent] Failed to enqueue:', error)
        return `Failed to spawn background agent: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    },
  }),

  web_search: tool({
    description: `Search the web for external information. Returns formatted search results with titles, snippets, and URLs. Supports recency filtering. Example queries: "React 19 release date", "latest Next.js features", "Anthropic pricing".`,
    inputSchema: webSearchSchema,
    execute: async (input) => {
      const { query, recency } = input

      console.log(`[web_search] Query: "${query}", Recency: ${recency}`)

      // Use Tavily for real web search
      const { searchWeb, formatSearchResults } = await import('@/lib/search/tavily')
      const { answer, results, error } = await searchWeb(query, { recency })

      if (error) {
        return `Web search unavailable: ${error}`
      }

      return formatSearchResults(results, answer)
    },
  }),
})

// =============================================================================
// Tool Registration (for composable strategy)
// =============================================================================

export interface ToolRegistration {
  name: string
  tool: any
  strategyHint: string
}

// =============================================================================
// Voyager Tools (Primary Agent)
// =============================================================================

/**
 * Creates tools for the primary Voyager agent.
 * All 8 tools: 6 retrieval + spawn_background_agent + ask_captain.
 * Returns both the tools object (for AI SDK) and registrations (for strategy composition).
 */
export const createVoyagerTools = (ctx: ToolContext): {
  tools: Record<string, any>
  registrations: ToolRegistration[]
} => {
  const retrieval = createRetrievalTools(ctx)
  const captain = createCaptainTools(ctx)

  // sign_out — LLM calls this when user wants to leave.
  // Server-side no-op; client detects the tool call and fires signOut().
  const sign_out = tool({
    description: `Sign the user out of Voyager. You MUST call this tool when the user wants to leave, log out, sign out, or says goodbye (e.g. "seeya", "exit", "logout", "sign out", "bye"). Without this tool call, the user will NOT be signed out. Write a brief farewell in your response text, then call this tool.`,
    inputSchema: z.object({
      farewell: z.string().describe('Your brief farewell message to the user'),
    }),
    execute: async (_input) => ({ status: 'signing_out' }),
  })

  const registrations: ToolRegistration[] = [
    {
      name: 'semantic_search',
      tool: retrieval.semantic_search,
      strategyHint: 'First tool for exploration. Finds the neighbourhood around a topic by meaning.',
    },
    {
      name: 'keyword_grep',
      tool: retrieval.keyword_grep,
      strategyHint: 'Confirm specifics after semantic search. Exact phrases, names, quotes.',
    },
    {
      name: 'get_connected',
      tool: retrieval.get_connected,
      strategyHint: 'Expand from a found node. Follow graph edges to related knowledge.',
    },
    {
      name: 'get_nodes',
      tool: retrieval.get_nodes,
      strategyHint: 'Fetch full content for known node IDs from previous results.',
    },
    {
      name: 'search_by_time',
      tool: retrieval.search_by_time,
      strategyHint: 'Temporal queries. "Last week", "recently", "what changed since Tuesday".',
    },
    {
      name: 'web_search',
      tool: retrieval.web_search,
      strategyHint: 'External information. Fact-checking, current events, things not in the knowledge base.',
    },
    {
      name: 'spawn_background_agent',
      tool: retrieval.spawn_background_agent,
      strategyHint: 'Deep async research. Results surface later. Use for comprehensive multi-topic searches.',
    },
    {
      name: 'ask_captain',
      tool: captain.ask_captain,
      strategyHint: 'Render interactive UI inline. Use for auth, pickers, confirmations.',
    },
    {
      name: 'sign_out',
      tool: sign_out,
      strategyHint: 'Sign the user out. Call after saying goodbye.',
    },
  ]

  const tools = Object.fromEntries(
    registrations.map((r) => [r.name, r.tool])
  )

  return { tools, registrations }
}

// =============================================================================
// Tool Types (for use in chat route)
// =============================================================================

export type RetrievalTools = ReturnType<typeof createRetrievalTools>
export type VoyagerTools = ReturnType<typeof createVoyagerTools>
