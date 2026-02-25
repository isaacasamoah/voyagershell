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
  buildScopeFilter,
  type KnowledgeNode,
  type GrepResult,
} from '@/lib/knowledge'
import { getAdminClient } from '@/lib/supabase/admin'
import { enqueueAgentTask, completeTask, failTask } from '@/lib/agents/queue'
import { createCaptainTools } from '@/lib/tools/captain'
import { createVoyage, generateSlug, isSlugAvailable, getVoyageBySlug, getVoyageMembers } from '@/lib/voyage'
import { createMessageEvent } from '@/lib/knowledge/events'

// Resolve short ID (8 chars) to full UUID
const resolveNodeId = async (shortOrFullId: string, ctx: ToolContext): Promise<string | null> => {
  // If it's already a full UUID (36 chars with dashes), return as-is
  if (shortOrFullId.length === 36 && shortOrFullId.includes('-')) {
    return shortOrFullId
  }

  // Otherwise, look up by prefix
  const supabase = getAdminClient()

  const { data } = await supabase
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
      const results = await getConnectedKnowledge(fullId, ctx.userId)
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
      const results = await getKnowledgeByIds(nodeIds, ctx.userId)
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

      const supabase = getAdminClient()

      let dbQuery = supabase
        .from('knowledge_current')
        .select('*')
        .gte('attention_score', 0.1)
        .gte('source_created_at', sinceDate.toISOString())
        .lte('source_created_at', untilDate.toISOString())
        .order('source_created_at', { ascending: false })
        .limit(Math.min(limit, 30))

      // Two-layer scope: personal (voyage_slug NULL) + voyage (participant-filtered)
      if (ctx.voyageSlug) {
        dbQuery = dbQuery.or(buildScopeFilter(ctx.userId, ctx.voyageSlug))
      } else {
        dbQuery = dbQuery.eq('user_id', ctx.userId).is('voyage_slug', null)
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

      // Filter by query if provided (case-insensitive content match)
      let filtered = results
      if (query) {
        const lowerQuery = query.toLowerCase()
        filtered = results.filter((r) => r.content.toLowerCase().includes(lowerQuery))
      }

      if (filtered.length === 0) {
        return query
          ? `No knowledge matching "${query}" found between ${sinceDate.toLocaleDateString()} and ${untilDate.toLocaleDateString()}.`
          : `No knowledge found between ${sinceDate.toLocaleDateString()} and ${untilDate.toLocaleDateString()}.`
      }

      const header = `Found ${filtered.length} items from ${sinceDate.toLocaleDateString()} to ${untilDate.toLocaleDateString()}:\n\n`
      return header + formatKnowledgeResult(filtered)
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
// Message Retrieval (V6: Structural Query)
// =============================================================================

const getMessagesSchema = z.object({
  channel: z.string().optional().describe('Channel name to query (e.g. "design"). Omit for direct mentions.'),
  since: z.string().optional().describe('ISO timestamp or relative date (e.g. "yesterday", "2 hours ago"). Default: last 24 hours.'),
})

// Relative time formatting for message display
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
 * 12 tools: 6 retrieval + spawn_background_agent + ask_captain + create_voyage + sign_out + resolve_mention + get_messages.
 * Returns both the tools object (for AI SDK) and registrations (for strategy composition).
 */
export const createVoyagerTools = (ctx: ToolContext): {
  tools: Record<string, any>
  registrations: ToolRegistration[]
} => {
  const retrieval = createRetrievalTools(ctx)
  const captain = createCaptainTools(ctx)

  // create_voyage — LLM calls this when user wants to create a new voyage
  const create_voyage = tool({
    description: `Create a new voyage (community space). The user becomes captain. Returns the voyage details and invite code for sharing. Use when the user says "create a voyage", "start a new voyage", "make a group called X", etc.`,
    inputSchema: z.object({
      name: z.string().min(1).max(100).describe('Name for the voyage'),
      description: z.string().max(500).optional().describe('Optional description'),
    }),
    execute: async (input) => {
      const { name, description } = input
      const slug = generateSlug(name)

      // Check slug availability
      const available = await isSlugAvailable(slug)
      if (!available) {
        return `A voyage with a similar name already exists (slug: "${slug}"). Try a different name.`
      }

      const voyage = await createVoyage(
        { name, slug, description },
        ctx.userId
      )

      if (!voyage) {
        return 'Failed to create voyage. Please try again.'
      }

      return JSON.stringify({
        created: true,
        name: voyage.name,
        slug: voyage.slug,
        inviteCode: voyage.inviteCode,
      })
    },
  })

  // sign_out — LLM calls this when user wants to leave.
  // Server-side no-op; client detects the tool call and fires signOut().
  const sign_out = tool({
    description: `Sign the user out of Voyager. You MUST call this tool when the user wants to leave, log out, sign out, or says goodbye (e.g. "seeya", "exit", "logout", "sign out", "bye"). Without this tool call, the user will NOT be signed out. Write a brief farewell in your response text, then call this tool.`,
    inputSchema: z.object({
      farewell: z.string().describe('Your brief farewell message to the user'),
    }),
    execute: async (_input) => ({ status: 'signing_out' }),
  })

  // get_messages — V6: structural retrieval for messages (D15)
  const get_messages = tool({
    description: `Check messages in the current voyage. Default: shows messages where you were specifically mentioned (@you). With channel param: shows activity in that channel. Covers: "do I have messages?", "what's been sent to me?", "check my messages", "anything I missed?", "what happened in #channel?"`,
    inputSchema: getMessagesSchema,
    execute: async (input) => {
      const { channel, since } = input

      // AC 28: Requires voyage context
      if (!ctx.voyageSlug) {
        return 'Messages live in voyages. You\'re in personal space — switch to a voyage to check messages.'
      }

      const sinceDate = since
        ? parseRelativeDate(since)
        : new Date(Date.now() - 24 * 60 * 60 * 1000) // Default: last 24 hours

      const supabase = getAdminClient()

      let query = supabase
        .from('knowledge_current')
        .select('event_id, content, source_created_at, sender_display_name, sender_user_id, addressed_to, participants')
        .eq('event_type', 'message')                    // AC 23
        .eq('voyage_slug', ctx.voyageSlug)
        .gte('source_created_at', sinceDate.toISOString())
        .order('source_created_at', { ascending: false })
        .limit(20)                                       // AC 26

      if (channel) {
        // AC 21: Channel mode — filter by source metadata + visibility gate
        // Channel support activates when V4 ships (resolve_channel writes source: 'channel:{name}')
        query = query.or(`participants.is.null,participants.cs.{${ctx.userId}}`)
      } else {
        // AC 20: Default mode — direct mentions only (attention gate)
        query = query.contains('addressed_to', [ctx.userId])
      }

      const { data, error } = await query

      if (error) {
        console.error('[get_messages] Query error:', error)
        return 'Error checking messages.'
      }

      // AC 22: exclude own messages
      const filtered = (data ?? []).filter((row) => row.sender_user_id !== ctx.userId)

      if (filtered.length === 0) {
        // AC 27: Empty state
        return channel
          ? `Nothing new in #${channel}.`
          : 'No one has mentioned you recently.'
      }

      // AC 25: Format with sender attribution
      const formatted = filtered.map((row) => {
        const sender = row.sender_display_name ?? 'Someone'
        const time = formatTimeAgo(new Date(row.source_created_at))
        const preview = row.content.slice(0, 100)
        return `${sender} (${time}): ${preview}`
      })

      return formatted.join('\n\n')
    },
  })

  // resolve_mention — LLM calls this for @mentions or NL routing ("tell tom", "ask sarah")
  const resolve_mention = tool({
    description: `Resolve @mentions or natural language message routing within the current voyage. Looks up voyage members by name and creates a participant-scoped knowledge event delivering the message. Covers both @name syntax ("@tom fix is ready") and natural language ("tell tom the fix is ready", "ask sarah about the pricing deck", "message tom about X"). Call this whenever someone is addressed or a message needs routing to specific people.`,
    inputSchema: z.object({
      names: z.array(z.string()).min(1).describe('Names to resolve (from @mentions or natural language, e.g. ["tom"] or ["tom", "sarah"])'),
      message: z.string().describe('The message content to deliver'),
    }),
    execute: async (input) => {
      const { names, message } = input

      // AC 7, 19: Requires voyage context
      if (!ctx.voyageSlug) {
        return 'Messaging requires a shared voyage. You\'re in personal space — to send messages, switch to a voyage first.'
      }

      // Look up voyage ID from slug
      const voyage = await getVoyageBySlug(ctx.voyageSlug)
      if (!voyage) {
        return 'Could not find the current voyage.'
      }

      // Get all members with profiles
      const members = await getVoyageMembers(voyage.id)

      // Resolve each name
      const resolved: Array<{ userId: string; displayName: string }> = []
      const ambiguous: Array<{ name: string; matches: Array<{ userId: string; displayName: string; email?: string }> }> = []
      const notFound: string[] = []

      for (const name of names) {
        const lower = name.toLowerCase()

        // AC 3: Check display_name first (case-insensitive), then nickname
        const matches = members.filter((m) => {
          const dn = m.displayName?.toLowerCase() ?? ''
          const nn = m.nickname?.toLowerCase() ?? ''
          // display_name: exact, starts-with, or any name part matches
          if (dn === lower || dn.startsWith(lower + ' ') || dn.split(' ').some(part => part === lower)) return true
          // nickname: exact match fallback
          if (nn && nn === lower) return true
          return false
        })

        if (matches.length === 1) {
          // AC 17: Self-mention check
          if (matches[0].userId === ctx.userId) {
            return `That's you! No need to send a message to yourself.`
          }
          resolved.push({ userId: matches[0].userId, displayName: matches[0].displayName ?? matches[0].email ?? 'unknown' })
        } else if (matches.length > 1) {
          // AC 5: Multiple matches → disambiguation
          ambiguous.push({
            name,
            matches: matches.map((m) => ({
              userId: m.userId,
              displayName: m.displayName ?? 'unknown',
              email: m.email,
            })),
          })
        } else {
          // AC 6, 18: No match
          notFound.push(name)
        }
      }

      // AC 5: Return ambiguous for ask_captain disambiguation
      if (ambiguous.length > 0) {
        const detail = ambiguous.map((a) =>
          `"${a.name}" matches: ${a.matches.map((m) => `${m.displayName} (${m.email ?? 'no email'})`).join(', ')}`
        ).join('; ')
        return `Multiple people match: ${detail}. Which one did you mean?`
      }

      // AC 6, 18: Not found
      if (notFound.length > 0) {
        const names_str = notFound.length === 1
          ? notFound[0]
          : notFound.slice(0, -1).join(', ') + ' or ' + notFound[notFound.length - 1]
        return `I don't see anyone called ${names_str} in this voyage.`
      }

      // AC 8, 9, 10: Create knowledge event with participants
      const mentionedIds = resolved.map((r) => r.userId)
      const allParticipants = [ctx.userId, ...mentionedIds]

      // V6 AC 11: Sender attribution from already-loaded members array
      const senderMember = members.find((m) => m.userId === ctx.userId)
      const senderDisplayName = senderMember?.displayName ?? senderMember?.email ?? 'Unknown'
      const recipientNames = resolved.map((r) => r.displayName)

      // V6 AC 13: Rich context snippet for semantic search
      const recipientStr = recipientNames.join(', ')
      const contentPreview = message.slice(0, 60)
      const contextSnippet = `${senderDisplayName} to ${recipientStr}: ${contentPreview}`

      await createMessageEvent(
        ctx.conversationId ?? 'mention',
        'user',
        message,
        {
          userId: ctx.userId,
          voyageSlug: ctx.voyageSlug,
          participants: allParticipants,
          addressedTo: mentionedIds,
          source: 'mention',
          // V6: sender attribution + inline classification
          senderDisplayName,
          senderUserId: ctx.userId,
          attentionScore: 0.85,    // D17: direct mention = high attention
          contextSnippet,
        }
      )
      return JSON.stringify({
        status: 'sent',
        recipients: recipientNames,
        message: message,
      })
    },
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
      name: 'create_voyage',
      tool: create_voyage,
      strategyHint: 'Create a new voyage when user asks. Returns name, slug, invite code.',
    },
    {
      name: 'sign_out',
      tool: sign_out,
      strategyHint: 'Sign the user out. Call after saying goodbye.',
    },
    {
      name: 'resolve_mention',
      tool: resolve_mention,
      strategyHint: 'Route messages to voyage members via @mention or natural language. Creates participant-scoped knowledge events.',
    },
    {
      name: 'get_messages',
      tool: get_messages,
      strategyHint: 'Structural message retrieval. Default: direct mentions. With channel: channel activity. "Do I have messages?"',
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
