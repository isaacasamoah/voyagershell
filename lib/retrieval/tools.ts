// Retrieval Tools for Agentic Search
// Voyager decides how to retrieve - not a fixed pipeline, intelligence
//
// Philosophy: Chain strategies for pinpoint accuracy
// semantic_search → found topic → graph → keyword_grep
//
// These tools are executed by Claude during response generation
// using Vercel AI SDK's tool calling capability.

import { tool } from 'ai'
import { z } from 'zod'
import {
  searchKnowledge,
  keywordGrep,
  personAnchoredSearch,
  getKnowledgeByIds,
  type KnowledgeNode,
  type GrepResult,
} from '@/lib/knowledge'
import { hybridSearch, type RankedResult } from '@/lib/knowledge/hybrid'
import { fanOutDeliveries } from '@/lib/messaging/deliveries'
import { getRoom, removeRoomPerson, setAiPresent } from '@/lib/messaging/room'
import { enterActiveRoom, inviteToRoom, respondToRoomInvite, deliverRoomInvite } from '@/lib/messaging/invites'
import { getAdminClient } from '@/lib/supabase/admin'
import { enqueueAgentTask, completeTask, runGuardedBackgroundTask } from '@/lib/agents/queue'
import { createCaptainTools } from '@/lib/tools/captain'
import { createVoyage, generateSlug, isSlugAvailable, getVoyageBySlug, getVoyageMembers, isCaptain, sendVoyageInvite, getUserVoyages, resolveMemberByName } from '@/lib/voyage'
import { normalizeUsername } from '@/lib/voyage/username'
import { claimHandle, renameVoyagerHandle } from '@/lib/messaging/handles'
import { createMessageEvent, createExplicitEvent } from '@/lib/knowledge/events'

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

const resolveOneMember = async (
  ctx: ToolContext,
  name: string
): Promise<{ userId: string; displayName: string } | { error: string }> => {
  if (!ctx.voyageSlug) return { error: "Rooms live in voyages. You're in personal space — switch to a voyage first." }
  const voyage = await getVoyageBySlug(ctx.voyageSlug)
  if (!voyage) return { error: 'Could not find the current voyage.' }
  const members = await getVoyageMembers(voyage.id)
  const match = resolveMemberByName(members, name)
  if (!match) return { error: `I don't see anyone called ${name} in this voyage.` }
  if (match.userId === ctx.userId) return { error: "That's you — you're already here." }
  return match
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
      return `[${i + 1}] id:${shortId}${pinned}${similarity}\n${node.content}`
    })
    .join('\n\n')
}

const formatHybridResult = (results: RankedResult[]): string => {
  if (results.length === 0) {
    return 'No results found.'
  }

  return results
    .map((result, i) => {
      const shortId = result.eventId.slice(0, 8)
      const sources = result.sources.join('+')
      const score = result.score.toFixed(4)
      const attn = result.metadata.attention_score ?? 0.5
      const pinned = attn >= 0.9 ? ' [PINNED]' : ''
      return `[${i + 1}] id:${shortId}${pinned} (${sources}, rrf:${score})\n${result.content}`
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
      return `[${i + 1}] id:${shortId}${pinned}\n...${r.highlight}...`
    })
    .join('\n\n')
}

// =============================================================================
// Input Schemas (Zod)
// =============================================================================

const semanticSearchSchema = z.object({
  query: z.string().describe('The semantic search query'),
  limit: z.number().optional().default(10).describe('Max results to return (1-15)'),
  threshold: z.number().optional().default(0.6).describe('Min similarity (0-1)'),
})

const keywordGrepSchema = z.object({
  pattern: z.string().describe('Exact phrase or keyword to find'),
  caseSensitive: z.boolean().optional().default(false),
  limit: z.number().optional().default(10).describe('Max results'),
})

const graphSchema = z.object({
  nodeId: z.string().describe('The event ID (or first 8 chars) from search results, e.g. "abc12345"'),
  edge_type: z.string().nullable().optional().describe('Filter by edge type: supersedes, supports, contradicts, elaborates, triggered_by, relates_to, decided_by, raised_by. Null returns all types.'),
  direction: z.enum(['outgoing', 'incoming', 'both']).optional().default('both').describe('Edge direction to traverse'),
  depth: z.number().min(1).max(3).optional().default(1).describe('Traversal depth (1-3 hops)'),
})

const anchoredSearchSchema = z.object({
  person: z.string().describe('The person to anchor on (name as the user referred to them)'),
  query: z.string().optional().describe('Optional topic to narrow to, e.g. "the almond tree idea"'),
  limit: z.number().optional().default(15),
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
    description: `Semantic search across the knowledge base. Finds content by conceptual similarity to the query. Uses hybrid retrieval (semantic + keyword) with reciprocal rank fusion for higher quality results. Example queries: "pricing discussions", "onboarding decisions", "what we know about React performance".`,
    inputSchema: semanticSearchSchema,
    execute: async (input) => {
      const { query, limit, threshold } = input
      // hybridSearch runs full pipeline (50 candidates → RRF → rerank top 15)
      // Tool limit only controls how many reranked results the agent sees
      const results = await hybridSearch(ctx.userId, query, {
        semanticThreshold: threshold,
        voyageSlug: ctx.voyageSlug,
      })
      return formatHybridResult(results.slice(0, limit))
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

  graph: tool({
    description: `Traverse the knowledge graph from a node. Follows typed directional edges (supersedes, supports, contradicts, elaborates, triggered_by, relates_to, decided_by, raised_by). Multi-hop traversal up to 3 levels deep. Three patterns: (1) "what supports this?" — incoming supports edges, (2) "what did this replace?" — outgoing supersedes edges, (3) "explore neighbourhood" — both directions, depth 2-3.`,
    inputSchema: graphSchema,
    execute: async (input) => {
      const { nodeId, edge_type, direction, depth } = input
      const fullId = await resolveNodeId(nodeId, ctx)
      if (!fullId) {
        return `No node found matching ID "${nodeId}"`
      }

      const supabase = getAdminClient()
      const { data, error } = await (supabase.rpc as Function)('graph_traverse', {
        p_node_id: fullId,
        p_edge_type: edge_type ?? null,
        p_direction: direction,
        p_depth: depth,
        p_min_attention: 0.3,
        p_max_nodes: 50,
        // Scope the traversal to the caller — graph_traverse runs on the admin
        // client (RLS-bypassed), so privacy is enforced by these args inside
        // knowledge_in_scope(). Omitting them denies every row (deny-by-default).
        p_user_id: ctx.userId,
        p_voyage_slug: ctx.voyageSlug ?? null,
        p_participants: [ctx.userId],
      })

      if (error) {
        return `Graph traversal error: ${error.message}`
      }

      if (!data || data.length === 0) {
        return `Node ${nodeId} has no connections${edge_type ? ` of type "${edge_type}"` : ''}.`
      }

      // Format graph results with edge metadata (NOT through reranker — D4)
      return (data as Array<{
        event_id: string
        content: string
        edge_type: string
        edge_direction: string
        hop: number
        knowledge_type: string | null
        attention_score: number | null
        context_snippet: string | null
      }>)
        .map((row, i) => {
          const shortId = row.event_id.slice(0, 8)
          const edgeLabel = `${row.edge_direction} ${row.edge_type}`
          const hopLabel = row.hop > 1 ? ` (${row.hop} hops)` : ''
          return `[${i + 1}] id:${shortId} [${edgeLabel}]${hopLabel}\n${row.content}`
        })
        .join('\n\n')
    },
  }),

  anchored_search: tool({
    description: `Retrieve what a SPECIFIC PERSON has shared or contributed, optionally about a topic. Anchor-first retrieval: use this the moment the user names a person — "what did Vanessa say about X", "what has Tom contributed", "@vanessa on pricing". Returns that person's contributions that YOU can see (shared + co-participated), ranked by attention. For general topic search with no named person, use semantic_search instead.`,
    inputSchema: anchoredSearchSchema,
    execute: async (input) => {
      if (!ctx.voyageSlug) return 'Anchoring on a person needs a voyage context.'
      const r = await resolveOneMember(ctx, input.person)
      if ('error' in r) return r.error
      const results = await personAnchoredSearch(ctx.userId, r.userId, {
        voyageSlug: ctx.voyageSlug,
        query: input.query,
        limit: Math.min(input.limit ?? 15, 20),
      })
      if (results.length === 0) return `Nothing from ${r.displayName}${input.query ? ` about "${input.query}"` : ''} that you can see.`
      return formatGrepResult(results)
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
      const { data, error } = await (supabase.rpc as Function)('scoped_knowledge_fetch', {
        p_user_id: ctx.userId,
        p_voyage_slug: ctx.voyageSlug,
        p_participants: [ctx.userId],
        p_scope: ctx.voyageSlug ? 'all' : 'personal',
        p_since: sinceDate.toISOString(),
        p_until: untilDate.toISOString(),
        p_min_attention: 0.1,
        p_match_count: Math.min(limit, 30),
      })

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
    description: `Spawn a background agent for deep asynchronous research. The agent works independently and its finished answer arrives in the user's feed as a delivered Voyager message. YOU MUST CALL THIS TOOL whenever you tell the user you are researching in the background — announcing research without calling it is a false promise. Suitable for comprehensive multi-topic searches or research spanning long time periods.`,
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
            await runGuardedBackgroundTask({
              taskId,
              run: async (signal) => {
                // Import and run the background retrieval agent
                const { runBackgroundRetrieval } = await import('@/lib/agents/deep-retrieval')
                return runBackgroundRetrieval({
                  taskId,
                  objective,
                  context: context ?? '',
                  userId: ctx.userId,
                  voyageSlug: ctx.voyageSlug,
                  conversationId: ctx.conversationId!,
                }, signal)
              },
              onComplete: async (result) => {
                const eventId = await createMessageEvent(
                  ctx.conversationId!,
                  'assistant',
                  result.message,
                  {
                    userId: ctx.userId,
                    voyageSlug: ctx.voyageSlug,
                    participants: [ctx.userId],
                    addressedTo: [ctx.userId],
                    source: 'agent',
                    senderDisplayName: 'Voyager',
                    attentionScore: 0.85,
                    eventType: 'message',
                    contextSnippet: `Voyager research: ${objective.slice(0, 60)}`,
                  },
                )
                if (!eventId) {
                  throw new Error('Failed to create background research message event')
                }
                await fanOutDeliveries(eventId, [ctx.userId])
                await completeTask(taskId, result, Date.now() - startTime)
                console.log(`[spawn_background_agent] Task ${taskId.slice(0, 8)} completed: ${result.findings.length} findings`)
              },
              onFailure: (error) => {
                console.error(`[spawn_background_agent] Task ${taskId.slice(0, 8)} failed:`, error)
              },
            })
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
 * 15 tools: 6 retrieval + spawn_background_agent + ask_captain + create_voyage + invite_to_voyage + sign_out + switch_voyage + set_display_name + send_message + get_messages.
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

  // invite_to_voyage — Captain invites someone via magic link email
  const invite_to_voyage = tool({
    description: `Invite someone to the current voyage by email. Sends them a magic link that authenticates and joins them in one click. Captain-only — crew members cannot invite. Always confirm with the user before sending. Use when the captain says "invite X to Y", "add X to the voyage", "send X an invite", etc.`,
    inputSchema: z.object({
      email: z.string().describe('Email address to invite'),
      voyage_name: z.string().optional().describe('Voyage name for disambiguation (uses current voyage if omitted)'),
    }),
    execute: async (input) => {
      const { email } = input

      // Requires voyage context
      if (!ctx.voyageSlug) {
        return 'You need to be in a voyage to send invites. Switch to a voyage first.'
      }

      // Captain-only
      const captainCheck = await isCaptain(ctx.voyageSlug, ctx.userId)
      if (!captainCheck) {
        return 'Only the captain can send invites. Ask your captain to invite them.'
      }

      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return 'That doesn\'t look like a valid email address.'
      }

      // Fetch captain's display name for the email
      const adminClient = getAdminClient()
      const { data: profile } = await adminClient
        .from('profiles')
        .select('display_name')
        .eq('id', ctx.userId)
        .maybeSingle()

      const inviterName = (profile as { display_name: string | null } | null)?.display_name || 'Someone'

      const result = await sendVoyageInvite({
        email,
        voyageSlug: ctx.voyageSlug,
        invitedBy: ctx.userId,
        inviterDisplayName: inviterName,
      })

      if (result.alreadyInvited) {
        return `${email} already has a pending invite to this voyage.`
      }

      if (!result.success) {
        return result.error || 'Failed to send invite.'
      }

      return `Invite sent to ${email}. They'll receive a magic link to join.`
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

  // switch_voyage — LLM calls this when user wants to change voyage context.
  // Server resolves name to slug; client detects the tool call and fires setCurrentVoyage.
  const switch_voyage = tool({
    description: `Switch to a different voyage or to personal space. Use when the user says "switch to X", "go to X", "change to X voyage", "switch to personal", etc. Resolves the voyage name against the user's memberships.`,
    inputSchema: z.object({
      voyage_name: z.string().describe('Name of the voyage to switch to, or "personal" for personal space'),
    }),
    execute: async (input) => {
      const { voyage_name } = input

      // Handle "personal" explicitly
      if (voyage_name.toLowerCase() === 'personal') {
        // Canonical scope: null slug signals personal space to the client
        return JSON.stringify({
          switched: true,
          voyageSlug: null,
          name: 'Personal',
          conversationId: ctx.conversationId ?? null,
        })
      }

      // Look up the user's voyages
      const memberships = await getUserVoyages(ctx.userId)

      if (memberships.length === 0) {
        return "You're not part of any voyages yet. Want to create one?"
      }

      // Case-insensitive match
      const lower = voyage_name.toLowerCase()
      const match = memberships.find(v =>
        v.name.toLowerCase() === lower ||
        v.slug.toLowerCase() === lower
      )

      if (!match) {
        const names = memberships.map(v => v.name).join(', ')
        return `No voyage called "${voyage_name}" found. Your voyages: ${names}`
      }

      // Return canonical scope: { switched, voyageSlug, name, conversationId }
      // The client adopts this as the new context without trusting a stale local slug.
      return JSON.stringify({
        switched: true,
        voyageSlug: match.slug,
        name: match.name,
        conversationId: ctx.conversationId ?? null,
      })
    },
  })

  // set_display_name — LLM calls this when user tells Voyager their name
  const set_display_name = tool({
    description: `Set the user's display name. Use when a new user tells you what to call them, or when any user wants to change their display name. Natural follow-up: confirm with their name ("Got it, {name}."). Distinct from username (the addressing handle) — display name is only how their messages are labeled.`,
    inputSchema: z.object({
      name: z.string().min(1).max(50).describe('The display name to set'),
    }),
    execute: async (input) => {
      const { name } = input
      const supabase = getAdminClient()
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: name })
        .eq('id', ctx.userId)
      if (error) {
        console.error('[set_display_name] Error:', error)
        return 'Failed to save your name. Try again?'
      }
      return JSON.stringify({ set: true, name })
    },
  })

  // set_username — LLM calls this when the user claims an addressing handle
  const set_username = tool({
    description: `Set the user's USERNAME — their unique addressing handle (how others reach them: "+isaac", "tell isaac"). Use when the user claims a handle ("set my username to isaac", "let people reach me as isaac"). Distinct from display name (how their messages are labeled). Usernames are lowercase letters/numbers/._- (2-31 chars).`,
    inputSchema: z.object({ username: z.string() }),
    execute: async (input) => {
      const normalized = normalizeUsername(input.username)
      if (!normalized.ok) return normalized.error

      const { username } = normalized
      // The handles namespace is the uniqueness authority — claim there FIRST so
      // the human handle row lands alongside the profile label (G4 parity).
      const claim = await claimHandle(ctx.userId, username, 'human')
      if (!claim.ok) return claim.error

      const supabase = getAdminClient()
      const { error } = await supabase
        .from('profiles')
        .update({ username })
        .eq('id', ctx.userId)

      if (error?.code === '23505') {
        return `That username's taken — try another.`
      }
      if (error) {
        console.error('[set_username] Error:', error)
        return 'Failed to save your username. Try again?'
      }

      return `Username set: ${username}. People can now reach you with +${username} or "tell ${username}".`
    },
  })

  // name_voyager — LLM calls this when the user names their own Voyager. The
  // name becomes a handle in the shared namespace: "@<name>" is a private aside
  // to their OWN Voyager, "<name>, …" summons it. Same set_username-style
  // validation (pattern + reserved), uniqueness across the whole namespace.
  const name_voyager = tool({
    description: `Name the user's Voyager — give their agent a personal name they can address ("call you Wren", "name my voyager Sol"). After naming, "@<name>" is a private aside only their own Voyager hears, and "<name>, …" summons it aloud. Lowercase letters/numbers/._- (2-31 chars), unique across everyone's handles.`,
    inputSchema: z.object({
      name: z.string().describe('The name to give the Voyager, e.g. "Wren"'),
    }),
    execute: async (input) => {
      const result = await renameVoyagerHandle(ctx.userId, input.name)
      if (!result.ok) return result.error
      return `Done — I'm ${result.handle} now. Whisper "@${result.handle} …" for a private aside, or say "${result.handle}, …" to summon me.`
    },
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

  // send_message — the tell verb's tool: @mentions or NL routing ("tell tom", "ask sarah")
  const send_message = tool({
    description: `Send a message to voyage members. Resolves @mentions or natural-language routing, then creates a participant-scoped message event and fans out delivery. Covers both @name syntax ("@tom fix is ready") and natural language ("tell tom the fix is ready", "ask sarah about the pricing deck", "message tom about X"). Call this whenever someone is addressed or a message needs routing to specific people.`,
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
        const lower = name.toLowerCase().trim()

        const usernameMatches = members.filter((m) => m.username?.toLowerCase() === lower)
        if (usernameMatches.length === 1) {
          const match = usernameMatches[0]
          if (match.userId === ctx.userId) {
            return `That's you! No need to send a message to yourself.`
          }
          resolved.push({ userId: match.userId, displayName: match.displayName ?? match.email ?? 'unknown' })
          continue
        }

        // AC 3: After username, check display_name (case-insensitive), then nickname
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

      const eventId = await createMessageEvent(
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

      // The delivery lane: fan out receipt rows so recipients' live wires
      // fire (M0.2) and offline recipients catch up. Deferred via waitUntil —
      // a bare void promise is dropped when the lambda freezes post-stream
      // (omega P1); a fan-out failure still never fails the send.
      if (eventId) {
        if (ctx.waitUntil) {
          ctx.waitUntil(fanOutDeliveries(eventId, mentionedIds))
        } else {
          await fanOutDeliveries(eventId, mentionedIds)
        }
      }

      return JSON.stringify({
        status: 'sent',
        recipients: recipientNames,
        message: message,
      })
    },
  })

  // ── The Room: participants as spine, Voyager as a peer ──
  // add_to_room / remove_from_room manage who's in the room; set_voyager_presence
  // toggles the AI. A person in the room receives everything you type (no
  // per-line "tell").
  const add_to_room = tool({
    description: `INVITE a person to THIS conversation (the room). They get a knock and join only when they accept — they are NOT in the room until then. Use for "+vanessa", "add vanessa", "bring tom in", "invite sarah here".`,
    inputSchema: z.object({ name: z.string().describe('The person to invite') }),
    execute: async (input) => {
      if (!ctx.conversationId) return "I can't manage this room — no active conversation."
      const r = await resolveOneMember(ctx, input.name)
      if ('error' in r) return r.error
      const invite = await inviteToRoom(ctx.conversationId, r.userId)
      if (invite.state === 'invited') {
        // The knock — same delivery as the `+name` path (one source).
        const voyage = ctx.voyageSlug ? await getVoyageBySlug(ctx.voyageSlug) : null
        const members = voyage ? await getVoyageMembers(voyage.id) : []
        const me = members.find((m) => m.userId === ctx.userId)
        await deliverRoomInvite(
          ctx.conversationId,
          { userId: ctx.userId, displayName: me?.displayName ?? me?.email ?? 'Someone' },
          r.userId,
          ctx.voyageSlug,
        )
        return `${r.displayName} has been INVITED — they are NOT in the room yet and cannot see these messages. They received a knock and will join only if they accept. Tell the user exactly this; do not claim they were added.`
      }
      return `${r.displayName} is in the room — they'll receive what's typed here.`
    },
  })

  const respond_to_room_invite = tool({
    description: `Respond to a pending room invitation on the user's behalf. Call when the user engages with an invite — "join", "sure, add me", "yes" (accept:true) or "no thanks", "not now", "decline" (accept:false). Also call with accept:true when the user wants to hop back into a room they're already a member of from a new session.`,
    inputSchema: z.object({
      accept: z.boolean().describe('true = join the room, false = decline'),
    }),
    execute: async (input) => {
      if (!ctx.conversationId) return 'No pending room invite.'

      const response = await respondToRoomInvite(ctx.conversationId, ctx.userId, input.accept)
      if (response.responded) return JSON.stringify(response)

      if (input.accept) {
        const entered = await enterActiveRoom(ctx.conversationId, ctx.userId)
        if (entered.entered) return JSON.stringify(entered)
      }

      return 'No pending room invite.'
    },
  })

  const remove_from_room = tool({
    description: `Remove a person from THIS conversation (the room). Use for "-vanessa", "remove vanessa", "just us again".`,
    inputSchema: z.object({ name: z.string().describe('The person to remove') }),
    execute: async (input) => {
      if (!ctx.conversationId) return "I can't manage this room — no active conversation."
      const r = await resolveOneMember(ctx, input.name)
      if ('error' in r) return r.error
      await removeRoomPerson(ctx.conversationId, r.userId)
      return JSON.stringify({ status: 'removed', person: r.displayName })
    },
  })

  const set_voyager_presence = tool({
    description: `Toggle whether Voyager (you) is in the room and responds. "+voyager" / "voyager join" → present=true; "-voyager" / "make this private" / "just us humans" → present=false (you go quiet, humans still receive each other's messages).`,
    inputSchema: z.object({ present: z.boolean().describe('true = Voyager in the room; false = step out') }),
    execute: async (input) => {
      if (!ctx.conversationId) return "No active conversation."
      await setAiPresent(ctx.conversationId, input.present)
      return JSON.stringify({ status: input.present ? 'voyager_present' : 'voyager_stepped_out' })
    },
  })

    // remember_knowledge — LLM calls this when user wants to save knowledge explicitly
  const remember_knowledge = tool({
    description: `Save knowledge explicitly. Use when the user says "remember this", "save this", "note that", "keep in mind", etc. Creates a persistent knowledge event that Voyager will recall in future conversations.`,
    inputSchema: z.object({
      content: z.string().describe('The knowledge to remember'),
      classifications: z.array(
        z.enum(['fact', 'preference', 'decision', 'procedure', 'insight', 'entity'])
      ).optional().describe('Knowledge type(s). Defaults to preference for "remember" commands.'),
    }),
    execute: async (input) => {
      const classifications = input.classifications ?? ['preference']
      const eventId = await createExplicitEvent(input.content, {
        userId: ctx.userId,
        voyageSlug: ctx.voyageSlug,
        classifications,
        sessionId: ctx.conversationId,
      })

      if (!eventId) {
        return 'Failed to save knowledge. Please try again.'
      }

      return `Saved as ${classifications.join(', ')} knowledge.`
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
      name: 'graph',
      tool: retrieval.graph,
      strategyHint: 'Traverse the knowledge graph from a node. Three patterns: (1) incoming supports edges for evidence, (2) outgoing supersedes for replaced knowledge, (3) both directions depth 2-3 for neighbourhood exploration.',
    },
    {
      name: 'anchored_search',
      tool: retrieval.anchored_search,
      strategyHint: 'Anchor-first retrieval for named people. Use when the user asks what a specific voyage member shared or contributed, optionally about a topic.',
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
      name: 'invite_to_voyage',
      tool: invite_to_voyage,
      strategyHint: 'Captain invites someone by email. Sends magic link that authenticates + joins in one click.',
    },
    {
      name: 'sign_out',
      tool: sign_out,
      strategyHint: 'Sign the user out. Call after saying goodbye.',
    },
    {
      name: 'switch_voyage',
      tool: switch_voyage,
      strategyHint: 'Switch voyage context. "switch to X", "go to personal". Client-side state change.',
    },
    {
      name: 'set_display_name',
      tool: set_display_name,
      strategyHint: 'Set user display name. New users without a name, or name change requests.',
    },
    {
      name: 'set_username',
      tool: set_username,
      strategyHint: 'Set the unique username people use to address the user.',
    },
    {
      name: 'name_voyager',
      tool: name_voyager,
      strategyHint: 'Name the user\'s own Voyager ("call you Wren"). Enables @<name> private asides and "<name>, …" summons.',
    },
    {
      name: 'send_message',
      tool: send_message,
      strategyHint: 'Route messages to voyage members via @mention or natural language. Creates participant-scoped knowledge events.',
    },
    {
      name: 'add_to_room',
      tool: add_to_room,
      strategyHint: 'Add a person to THIS conversation so the user talks to them directly (no per-line tell). "+vanessa", "add tom".',
    },
    {
      name: 'respond_to_room_invite',
      tool: respond_to_room_invite,
      strategyHint: 'Accept or decline a pending room invitation when the user responds to it.',
    },
    {
      name: 'remove_from_room',
      tool: remove_from_room,
      strategyHint: 'Remove a person from THIS conversation. "-vanessa", "just us".',
    },
    {
      name: 'set_voyager_presence',
      tool: set_voyager_presence,
      strategyHint: 'Toggle whether you (Voyager) are in the room. "-voyager" to step out (private human thread), "+voyager" to rejoin.',
    },
    {
      name: 'get_messages',
      tool: get_messages,
      strategyHint: 'Structural message retrieval. Default: direct mentions. With channel: channel activity. "Do I have messages?"',
    },
    {
      name: 'remember_knowledge',
      tool: remember_knowledge,
      strategyHint: 'Save explicit knowledge. "Remember I prefer morning meetings", "note that Tom handles billing", "save this decision".',
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
