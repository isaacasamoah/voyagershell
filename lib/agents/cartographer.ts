// Cartographer
// Maps the territory as you explore it — enriches knowledge continuously
// during conversation, not post-mortem.
//
// Trigger: count-based (>= ENRICHMENT_THRESHOLD unenriched events per session)
// Stage 1: Classify unenriched events (pure reasoning, no tools).
// Stage 2: Find cross-session connections via retrieval tools.
// Then: enrich knowledge_current rows + re-embed with context snippets.
//
// Fire-and-forget — errors are logged, never thrown.

import { generateText, stepCountIs } from 'ai'
import OpenAI from 'openai'
import { modelRouter } from '@/lib/models/router'
import { getAdminClient } from '@/lib/supabase/admin'
import { loadConversationMessages } from '@/lib/conversation'
import { estimateTokens } from '@/lib/conversation/window'
import { updateKnowledgeEnrichment, type KnowledgeType } from '@/lib/knowledge/events'
import { createRetrievalTools, type ToolContext } from '@/lib/retrieval/tools'
import { log } from '@/lib/debug/logger'

// =============================================================================
// Types
// =============================================================================

interface CartographerPayload {
  sessionId: string
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

interface KnowledgeEventRow {
  event_id: string
  content: string
  source_created_at: string
}

// =============================================================================
// Constants
// =============================================================================

/** Minimum unenriched events before Cartographer fires */
export const ENRICHMENT_THRESHOLD = 10

/** Messages of context before the oldest unenriched event */
const CONTEXT_MESSAGES_BEFORE = 5

/** Token budget for the transcript window */
const TRANSCRIPT_TOKEN_BUDGET = 12_000

// Lazy OpenAI for embeddings
let _openai: OpenAI | null = null
const getOpenAI = (): OpenAI => {
  if (!_openai) _openai = new OpenAI()
  return _openai
}

const toVectorString = (embedding: number[]): string => `[${embedding.join(',')}]`

// =============================================================================
// Concurrency Guard (in-memory, serverless-safe best-effort)
// =============================================================================

const _runningSessions = new Set<string>()

// =============================================================================
// Enrichment Trigger: Count-Based
// =============================================================================

/**
 * Check whether enrichment should run for this session.
 * Returns true when unenriched event count >= ENRICHMENT_THRESHOLD.
 */
export const shouldRunEnrichment = async (sessionId: string): Promise<boolean> => {
  const supabase = getAdminClient()

  const { count, error } = await (supabase as any)
    .from('knowledge_current')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .is('knowledge_type', null)

  if (error) {
    log.agent('Enrichment count check failed', { sessionId, error: error.message }, 'warn')
    return false
  }

  const unenriched = count ?? 0
  log.agent('Enrichment count check', { sessionId, unenriched, threshold: ENRICHMENT_THRESHOLD }, 'debug')

  return unenriched >= ENRICHMENT_THRESHOLD
}

// =============================================================================
// Load Unenriched Events from knowledge_current
// =============================================================================

const loadUnenrichedEvents = async (sessionId: string): Promise<KnowledgeEventRow[]> => {
  const supabase = getAdminClient()

  const { data, error } = await (supabase as any)
    .from('knowledge_current')
    .select('event_id, content, source_created_at')
    .eq('session_id', sessionId)
    .is('knowledge_type', null)
    .order('source_created_at', { ascending: true })

  if (error) {
    log.agent('Failed to load unenriched events', { sessionId, error: error.message }, 'error')
    return []
  }

  return (data ?? []) as KnowledgeEventRow[]
}

// =============================================================================
// Purpose-Built Enrichment Window
// =============================================================================

/**
 * Build a token-budgeted transcript anchored to the oldest unenriched event.
 * Includes CONTEXT_MESSAGES_BEFORE messages before the anchor for context,
 * plus all messages from anchor through latest.
 *
 * Truncates from the context-before portion if over budget (preserving
 * messages around unenriched events).
 */
const buildEnrichmentWindow = async (
  sessionId: string,
  oldestUnenrichedTime: string
): Promise<string> => {
  // Load all session messages
  const allMessages = await loadConversationMessages(sessionId, 500)
  if (allMessages.length === 0) return ''

  // Find the index of the first message at or after oldest unenriched event
  const anchorTime = new Date(oldestUnenrichedTime).getTime()
  let anchorIndex = allMessages.findIndex(
    (m) => m.createdAt.getTime() >= anchorTime
  )
  if (anchorIndex === -1) anchorIndex = 0

  // Context window: N messages before anchor through end
  const contextStart = Math.max(0, anchorIndex - CONTEXT_MESSAGES_BEFORE)
  const windowMessages = allMessages.slice(contextStart)

  // Format messages
  const formatted = windowMessages.map((m) => `${m.role}: ${m.content}`)

  // Token budget enforcement — truncate from context-before portion
  let totalTokens = 0
  const budgeted: string[] = []

  // First pass: add all messages from anchor onward (these are sacred)
  const anchorOffset = anchorIndex - contextStart
  for (let i = anchorOffset; i < formatted.length; i++) {
    totalTokens += estimateTokens(formatted[i])
    budgeted.push(formatted[i])
  }

  // Second pass: add context-before messages if budget allows (newest first)
  for (let i = anchorOffset - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(formatted[i])
    if (totalTokens + msgTokens > TRANSCRIPT_TOKEN_BUDGET) break
    totalTokens += msgTokens
    budgeted.unshift(formatted[i])
  }

  return budgeted.join('\n\n')
}

// =============================================================================
// Stage 1: Per-Event Assessment (pure reasoning, no tools)
// =============================================================================

const STAGE1_PROMPT = `You are the Cartographer for Voyager. You classify knowledge events from an ongoing conversation.

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
    .map((e) => `[${e.event_id}]: ${e.content.slice(0, 500)}`)
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

const STAGE2_PROMPT = `You are the Cartographer for Voyager (Stage 2: Relationship Mapping).

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
  const contentMap = new Map(events.map((e) => [e.event_id, e.content]))

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

export const runCartographer = async (payload: CartographerPayload): Promise<void> => {
  const { sessionId, userId, voyageSlug } = payload
  const startTime = Date.now()

  // Best-effort concurrency guard
  if (_runningSessions.has(sessionId)) {
    log.agent('Cartographer already running for session, skipping', { sessionId }, 'debug')
    return
  }
  _runningSessions.add(sessionId)

  log.agent('Cartographer triggered', { sessionId, userId })

  try {
    // Load unenriched knowledge events from knowledge_current
    const events = await loadUnenrichedEvents(sessionId)
    if (events.length === 0) {
      log.agent('No unenriched events found, skipping', { sessionId })
      return
    }

    // Build purpose-built enrichment window
    const oldestUnenrichedTime = events[0].source_created_at
    const transcript = await buildEnrichmentWindow(sessionId, oldestUnenrichedTime)
    if (!transcript) {
      log.agent('No transcript available, skipping', { sessionId })
      return
    }

    log.agent('Running Stage 1', { eventCount: events.length })

    // Stage 1: Per-event assessment (pure reasoning)
    const assessments = await runStage1(transcript, events)
    log.agent('Stage 1 complete', { assessmentCount: assessments.length })

    // Stage 2: Relationship mapping (agentic with tools)
    const toolCtx: ToolContext = { userId, voyageSlug, conversationId: sessionId }
    log.agent('Running Stage 2', { assessmentCount: assessments.length })

    const connections = await runStage2(assessments, toolCtx)
    log.agent('Stage 2 complete', { connectionCount: connections.length })

    // Apply enrichments + re-embed + connect
    await applyEnrichments(assessments, connections, events)

    const durationMs = Date.now() - startTime
    log.agent('Cartographer complete', {
      sessionId,
      events: events.length,
      assessments: assessments.length,
      connections: connections.length,
      durationMs,
    })
  } catch (err) {
    log.agent('Cartographer failed', {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    }, 'error')
    // Fire-and-forget: never throw
  } finally {
    _runningSessions.delete(sessionId)
  }
}
