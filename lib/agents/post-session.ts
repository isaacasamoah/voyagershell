// Post-Session Agent
// Fires after a conversation goes idle (5 min debounce).
// Stage 1: Classify every knowledge event from the session (pure reasoning).
// Stage 2: Find cross-session connections via retrieval tools.
// Then: enrich knowledge_current rows + re-embed with context snippets.
//
// Fire-and-forget — errors are logged, never thrown.

import { generateText, stepCountIs } from 'ai'
import OpenAI from 'openai'
import { modelRouter } from '@/lib/models/router'
import { getAdminClient } from '@/lib/supabase/admin'
import { loadConversationMessages } from '@/lib/conversation'
import { updateKnowledgeEnrichment, type KnowledgeType } from '@/lib/knowledge/events'
import { createRetrievalTools, type ToolContext } from '@/lib/retrieval/tools'
import { log } from '@/lib/debug/logger'

// =============================================================================
// Types
// =============================================================================

interface PostSessionPayload {
  conversationId: string
  userId: string
  voyageSlug?: string
}

interface Stage1Assessment {
  eventId: string
  knowledgeType: KnowledgeType
  attentionScore: number
  contextSnippet: string
}

interface Stage2Connection {
  fromEventId: string
  toEventId: string
}

// Lazy OpenAI for embeddings
let _openai: OpenAI | null = null
const getOpenAI = (): OpenAI => {
  if (!_openai) _openai = new OpenAI()
  return _openai
}

const toVectorString = (embedding: number[]): string => `[${embedding.join(',')}]`

// =============================================================================
// Debounce Check
// =============================================================================

const IDLE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

const isConversationIdle = async (conversationId: string): Promise<boolean> => {
  const supabase = getAdminClient()

  const { data, error } = await (supabase as any)
    .from('sessions')
    .select('last_message_at')
    .eq('id', conversationId)
    .single()

  if (error || !data) {
    log.agent('Debounce check failed — skipping', { conversationId, error: error?.message }, 'warn')
    return false
  }

  const lastMessageAt = new Date(data.last_message_at as string)
  const elapsed = Date.now() - lastMessageAt.getTime()

  if (elapsed < IDLE_THRESHOLD_MS) {
    log.agent('Conversation still active, skipping post-session', {
      conversationId,
      elapsedMs: elapsed,
      thresholdMs: IDLE_THRESHOLD_MS,
    }, 'debug')
    return false
  }

  return true
}

// =============================================================================
// Load Session Knowledge Events
// =============================================================================

interface KnowledgeEventRow {
  id: string
  content: string
  event_type: string
  metadata: Record<string, unknown>
}

const loadSessionEvents = async (conversationId: string): Promise<KnowledgeEventRow[]> => {
  const supabase = getAdminClient()

  const { data, error } = await (supabase as any)
    .from('knowledge_events')
    .select('id, content, event_type, metadata')
    .eq('metadata->>session_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) {
    log.agent('Failed to load session events', { conversationId, error: error.message }, 'error')
    return []
  }

  return (data ?? []) as KnowledgeEventRow[]
}

// =============================================================================
// Stage 1: Per-Event Assessment (pure reasoning, no tools)
// =============================================================================

const STAGE1_PROMPT = `You are the post-session agent for Voyager. You evaluate knowledge events from a completed conversation.

For EACH event, determine:

1. knowledge_type: one of "domain", "operational", or "preference"
   - "domain": facts, concepts, decisions, insights, technical knowledge
   - "operational": tasks, processes, what happened, meeting notes, project updates
   - "preference": user likes, dislikes, habits, communication preferences

2. attention_score: 0.0 to 1.0 (continuous)
   - For domain/operational: importance (1.0 = always surface, 0.0 = deep search only)
   - For preferences: confidence (1.0 = explicit/repeated, 0.5 = implicit hypothesis, 0.0 = degraded)
   - Explicit preferences ("always call me Cap") → 1.0
   - Trivial messages ("ok", "thanks", acknowledgments) → 0.1 or less
   - Substantive domain knowledge → 0.5-0.9 based on likely future relevance

3. context_snippet: One line of context to prepend before re-embedding. This DRAMATICALLY improves retrieval.
   - Should capture the conversational context that makes this knowledge useful
   - Example: "During architecture discussion about auth system:" or "User preference stated explicitly:"

Output a JSON array. One entry per event. Use the event IDs exactly as provided.`

const runStage1 = async (
  transcript: string,
  events: KnowledgeEventRow[]
): Promise<Stage1Assessment[]> => {
  if (events.length === 0) return []

  const eventList = events
    .map((e) => `[${e.id}] (${e.event_type}): ${e.content.slice(0, 500)}`)
    .join('\n\n')

  const userPrompt = `## Conversation Transcript
${transcript}

## Knowledge Events to Assess
${eventList}

Respond with a JSON array of objects: { "eventId": string, "knowledgeType": "domain"|"operational"|"preference", "attentionScore": number, "contextSnippet": string }`

  const result = await generateText({
    model: modelRouter.select({ task: 'chat', quality: 'balanced' }),
    system: STAGE1_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    maxOutputTokens: 4096,
  })

  // Parse the JSON from the response
  const text = result.text.trim()
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    log.agent('Stage 1 produced no parseable JSON', { text: text.slice(0, 200) }, 'error')
    return []
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      eventId: string
      knowledgeType: string
      attentionScore: number
      contextSnippet: string
    }>

    // Validate and clamp
    return parsed
      .filter((a) => a.eventId && a.knowledgeType && typeof a.attentionScore === 'number')
      .map((a) => ({
        eventId: a.eventId,
        knowledgeType: (['domain', 'operational', 'preference'].includes(a.knowledgeType)
          ? a.knowledgeType
          : 'operational') as KnowledgeType,
        attentionScore: Math.max(0, Math.min(1, a.attentionScore)),
        contextSnippet: a.contextSnippet || '',
      }))
  } catch (err) {
    log.agent('Stage 1 JSON parse failed', { error: String(err) }, 'error')
    return []
  }
}

// =============================================================================
// Stage 2: Relationship Mapping (agentic, uses retrieval tools)
// =============================================================================

const STAGE2_PROMPT = `You are the post-session agent for Voyager (Stage 2: Relationship Mapping).

You have the assessments from Stage 1. Your job is to find connections between these events and existing knowledge from previous sessions.

Use the retrieval tools to search for related knowledge. Use the context_snippets as search queries.

After searching, output a JSON array of connections:
{ "fromEventId": "<session event id>", "toEventId": "<existing knowledge event id>" }

Only create connections where there's genuine semantic relationship. Don't force connections.
If no meaningful connections exist, return an empty array.

Output ONLY the JSON array at the end, prefixed with "CONNECTIONS:" on its own line.`

const runStage2 = async (
  assessments: Stage1Assessment[],
  ctx: ToolContext
): Promise<Stage2Connection[]> => {
  if (assessments.length === 0) return []

  // Build context from stage 1 outputs
  const contextSummary = assessments
    .filter((a) => a.attentionScore >= 0.3) // Only search for non-trivial events
    .map((a) => `[${a.eventId.slice(0, 8)}] (${a.knowledgeType}, ${a.attentionScore}): ${a.contextSnippet}`)
    .join('\n')

  if (!contextSummary) return []

  const tools = createRetrievalTools(ctx)
  // Stage 2 only uses search tools, not spawn_background_agent or web_search
  const { semantic_search, keyword_grep, get_connected, get_nodes, search_by_time } = tools

  const result = await generateText({
    model: modelRouter.select({ task: 'chat', quality: 'balanced' }),
    system: STAGE2_PROMPT,
    messages: [
      {
        role: 'user',
        content: `## Stage 1 Assessments\n${contextSummary}\n\nSearch for related existing knowledge using the retrieval tools. Then output connections.`,
      },
    ],
    tools: { semantic_search, keyword_grep, get_connected, get_nodes, search_by_time },
    stopWhen: stepCountIs(6),
    maxOutputTokens: 4096,
  })

  // Parse connections from the final text
  const text = result.text.trim()
  const connectionsMatch = text.match(/CONNECTIONS:\s*(\[[\s\S]*\])/)
  if (!connectionsMatch) {
    // Try parsing the whole text as JSON array
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    try {
      return JSON.parse(jsonMatch[0]) as Stage2Connection[]
    } catch {
      return []
    }
  }

  try {
    return JSON.parse(connectionsMatch[1]) as Stage2Connection[]
  } catch {
    return []
  }
}

// =============================================================================
// Post-Processing: Enrich + Re-embed + Connect
// =============================================================================

const applyEnrichments = async (
  assessments: Stage1Assessment[],
  connections: Stage2Connection[],
  events: KnowledgeEventRow[]
): Promise<void> => {
  const supabase = getAdminClient()
  const openai = getOpenAI()

  // Build a content map for re-embedding
  const contentMap = new Map(events.map((e) => [e.id, e.content]))

  // Apply Stage 1 enrichments
  for (const assessment of assessments) {
    // Update knowledge_type, attention_score, context_snippet
    await updateKnowledgeEnrichment(assessment.eventId, {
      knowledgeType: assessment.knowledgeType,
      attentionScore: assessment.attentionScore,
      contextSnippet: assessment.contextSnippet || undefined,
    })

    // Re-embed with context_snippet prepended
    const originalContent = contentMap.get(assessment.eventId)
    if (originalContent && assessment.contextSnippet) {
      try {
        const textToEmbed = `${assessment.contextSnippet} ${originalContent}`
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: textToEmbed,
        })
        const embedding = response.data[0].embedding

        await (supabase as any).rpc('update_knowledge_embedding', {
          p_event_id: assessment.eventId,
          p_embedding: toVectorString(embedding),
        })
      } catch (err) {
        log.agent('Re-embed failed', { eventId: assessment.eventId, error: String(err) }, 'warn')
      }
    }
  }

  // Apply Stage 2 connections
  for (const conn of connections) {
    try {
      // Get current connected_to for the source event
      const { data: sourceRow } = await (supabase as any)
        .from('knowledge_current')
        .select('connected_to')
        .eq('event_id', conn.fromEventId)
        .single()

      const currentConnections = (sourceRow?.connected_to as string[]) ?? []
      if (!currentConnections.includes(conn.toEventId)) {
        await (supabase as any)
          .from('knowledge_current')
          .update({ connected_to: [...currentConnections, conn.toEventId] })
          .eq('event_id', conn.fromEventId)
      }

      // Bidirectional: update the target too
      const { data: targetRow } = await (supabase as any)
        .from('knowledge_current')
        .select('connected_to')
        .eq('event_id', conn.toEventId)
        .single()

      const targetConnections = (targetRow?.connected_to as string[]) ?? []
      if (!targetConnections.includes(conn.fromEventId)) {
        await (supabase as any)
          .from('knowledge_current')
          .update({ connected_to: [...targetConnections, conn.fromEventId] })
          .eq('event_id', conn.toEventId)
      }
    } catch (err) {
      log.agent('Connection update failed', { from: conn.fromEventId, to: conn.toEventId, error: String(err) }, 'warn')
    }
  }
}

// =============================================================================
// Main Entry Point
// =============================================================================

export const runPostSessionAgent = async (payload: PostSessionPayload): Promise<void> => {
  const { conversationId, userId, voyageSlug } = payload
  const startTime = Date.now()

  log.agent('Post-session agent triggered', { conversationId, userId })

  try {
    // Debounce: check if conversation is actually idle
    const idle = await isConversationIdle(conversationId)
    if (!idle) return

    // Load transcript
    const messages = await loadConversationMessages(conversationId)
    if (messages.length === 0) {
      log.agent('No messages found, skipping', { conversationId })
      return
    }

    const transcript = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n\n')

    // Load knowledge events from this session
    const events = await loadSessionEvents(conversationId)
    if (events.length === 0) {
      log.agent('No knowledge events found, skipping', { conversationId })
      return
    }

    log.agent('Running Stage 1', { eventCount: events.length })

    // Stage 1: Per-event assessment (pure reasoning)
    const assessments = await runStage1(transcript, events)
    log.agent('Stage 1 complete', { assessmentCount: assessments.length })

    // Stage 2: Relationship mapping (agentic with tools)
    const toolCtx: ToolContext = { userId, voyageSlug, conversationId }
    log.agent('Running Stage 2', { assessmentCount: assessments.length })

    const connections = await runStage2(assessments, toolCtx)
    log.agent('Stage 2 complete', { connectionCount: connections.length })

    // Apply enrichments + re-embed + connect
    await applyEnrichments(assessments, connections, events)

    const durationMs = Date.now() - startTime
    log.agent('Post-session agent complete', {
      conversationId,
      events: events.length,
      assessments: assessments.length,
      connections: connections.length,
      durationMs,
    })
  } catch (err) {
    log.agent('Post-session agent failed', {
      conversationId,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    }, 'error')
    // Fire-and-forget: never throw
  }
}
