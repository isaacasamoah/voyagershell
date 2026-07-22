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

import { generateText, generateObject, stepCountIs } from 'ai'
import { z } from 'zod'
import OpenAI from 'openai'
import { resolveUserModel } from '@/lib/models'
import { getAdminClient } from '@/lib/supabase/admin'
import { composeContextFromStream, renderMessagesForModel } from '@/lib/conversation'
import { estimateTokens } from '@/lib/conversation/window'
import { updateKnowledgeEnrichment, type KnowledgeType } from '@/lib/knowledge/events'
import { createEdge, type EdgeType } from '@/lib/knowledge/edges'
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
  edgeType: EdgeType
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
// Enrichment Trigger: Count-Based
// =============================================================================

/**
 * Check whether enrichment should run for this session.
 * Returns true when unenriched event count >= ENRICHMENT_THRESHOLD.
 */
export const shouldRunEnrichment = async (sessionId: string, userId: string): Promise<boolean> => {
  const supabase = getAdminClient()

  const { count, error } = await supabase
    .from('knowledge_current')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('user_id', userId)  // ORU-450: a shared room never feeds another participant's rows into the wrong user's classification
    .is('knowledge_type', null)
    .neq('event_type', 'message')  // D23: messages skip Cartographer — classified at write time

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

const loadUnenrichedEvents = async (sessionId: string, userId: string): Promise<KnowledgeEventRow[]> => {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('knowledge_current')
    .select('event_id, content, source_created_at')
    .eq('session_id', sessionId)
    .eq('user_id', userId)  // ORU-450: enrich only the triggering user's own rows — never a co-participant's
    .is('knowledge_type', null)
    .neq('event_type', 'message')  // D23: messages skip Cartographer — classified at write time
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
export const buildEnrichmentWindow = async (
  sessionId: string,
  oldestUnenrichedTime: string,
  userId: string,
  voyageSlug?: string,
): Promise<string> => {
  // Load session history from the same scoped stream that feeds turn context.
  const allMessages = await composeContextFromStream(userId, sessionId, voyageSlug ?? null, 500)
  if (allMessages.length === 0) return ''
  const modelMessages = renderMessagesForModel(allMessages)

  // Find the index of the first message at or after oldest unenriched event
  const anchorTime = new Date(oldestUnenrichedTime).getTime()
  let anchorIndex = modelMessages.findIndex(
    (m) => m.createdAt.getTime() >= anchorTime
  )
  if (anchorIndex === -1) anchorIndex = 0

  // Context window: N messages before anchor through end
  const contextStart = Math.max(0, anchorIndex - CONTEXT_MESSAGES_BEFORE)
  const windowMessages = modelMessages.slice(contextStart)

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
   - Substantive domain knowledge → 0.5-0.9 based on likely future relevance
   - Trivial messages ("ok", "thanks", acknowledgments) → 0.1 or less

   PREFERENCE DETECTION RULES:
   - Explicit preferences: user directly states a preference ("remember X", "always call me Y", "I prefer Z", "don't ever W"). These get attention 1.0.
   - Implicit preferences: observed from patterns or inferred from behaviour (user consistently uses short messages → prefers brevity). These get attention 0.5.
   - When unsure if explicit or implicit, default to implicit (0.5). Promotion is cheap, demotion loses trust.

3. context_snippet: A declarative statement about the knowledge itself. This is prepended before re-embedding and DRAMATICALLY improves retrieval.

   QUALITY RULES:
   - GOOD: Declarative statements about the knowledge. "Isaac prefers direct communication." "The auth system uses JWT with 24h expiry." "Project deadline is March 15."
   - BAD: Descriptions of the conversation. "User mentioned during onboarding." "Discussed in architecture meeting." "User said this while chatting."
   - The snippet should stand alone as a useful fact, not describe when/how it was learned.

   PREFIX RULES for preferences:
   - Explicit preferences (attention 1.0): prefix with "Explicit preference: " — e.g. "Explicit preference: Isaac prefers morning standups at 9am"
   - Implicit/observed preferences (attention < 1.0): prefix with "Observed preference: " — e.g. "Observed preference: tends to prefer concise code reviews"
   - Non-preference types: no prefix required, just write the declarative statement.

Output a JSON array. One entry per event. Use the event IDs exactly as provided.`

// Zod schema for structured Stage 1 output
const stage1Schema = z.object({
  assessments: z.array(z.object({
    eventId: z.string(),
    knowledgeType: z.enum(['domain', 'operational', 'preference']),
    attentionScore: z.number().describe('0.0 to 1.0'),
    contextSnippet: z.string(),
  })),
})

const runStage1 = async (
  transcript: string,
  events: KnowledgeEventRow[],
  userId: string
): Promise<Stage1Assessment[]> => {
  if (events.length === 0) return []

  const eventList = events
    .map((e) => `[${e.event_id}]: ${e.content.slice(0, 500)}`)
    .join('\n\n')

  const userPrompt = `## Conversation Transcript
${transcript}

## Knowledge Events to Assess
${eventList}

Assess each event and return structured output.`

  try {
    const { object } = await generateObject({
      model: await resolveUserModel({ task: 'chat', quality: 'balanced' }, userId),
      system: STAGE1_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      schema: stage1Schema,
      maxOutputTokens: 4096,
    })

    return object.assessments.map((a) => ({
      eventId: a.eventId,
      knowledgeType: a.knowledgeType as KnowledgeType,
      attentionScore: a.attentionScore,
      contextSnippet: a.contextSnippet,
    }))
  } catch (err) {
    log.agent('Stage 1 structured output failed', { error: String(err) }, 'error')
    return []
  }
}

// =============================================================================
// Stage 2: Relationship Mapping (agentic, uses retrieval tools)
// =============================================================================

const STAGE2_PROMPT = `You are the Cartographer for Voyager (Stage 2: Relationship Mapping).

You have the assessments from Stage 1. Your job is to find connections between these events and existing knowledge from previous sessions.

Use the retrieval tools to search for related knowledge. Use the context_snippets as search queries.

After searching, output a JSON array of typed edges:
{ "fromEventId": "<source event id>", "toEventId": "<target event id>", "edgeType": "<type>" }

Edge types and their directional semantics:
- supersedes: new -> old (replaces stale knowledge)
- supports: evidence -> claim (evidence chain)
- contradicts: claim -> claim (tension between ideas)
- elaborates: detail -> summary (deepens understanding)
- triggered_by: effect -> cause (causality)
- relates_to: concept <-> concept (lateral connection — HIGH BAR, use sparingly)
- decided_by: decision -> person (accountability)
- raised_by: concern/idea -> person (attribution)

Direction matters. The fromEventId is always the source of the arrow.
Only create edges where there's genuine semantic relationship. Don't force connections.
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
    .map((a) => `[${a.eventId}] (${a.knowledgeType}, ${a.attentionScore}): ${a.contextSnippet}`)
    .join('\n')

  if (!contextSummary) return []

  const tools = createRetrievalTools(ctx)
  // Stage 2 only uses search tools, not spawn_background_agent or web_search
  const { semantic_search, keyword_grep, graph, get_nodes, search_by_time } = tools

  const result = await generateText({
    model: await resolveUserModel({ task: 'chat', quality: 'balanced' }, ctx.userId),
    system: STAGE2_PROMPT,
    messages: [
      {
        role: 'user',
        content: `## Stage 1 Assessments\n${contextSummary}\n\nSearch for related existing knowledge using the retrieval tools. Then output connections.`,
      },
    ],
    tools: { semantic_search, keyword_grep, graph, get_nodes, search_by_time },
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
// Session Index (F3: session distance computation)
// =============================================================================

/**
 * Upsert the current session into session_index.
 * Called on every Cartographer run to maintain session ordering.
 */
const upsertSessionIndex = async (
  sessionId: string,
  userId: string,
  eventCount: number
): Promise<void> => {
  const supabase = getAdminClient()

  // session_index table added by migration 031 — not yet in generated types
  // Insert on first run, update only event_count on re-runs (preserve started_at)
  const { error: insertError } = await (supabase as any)
    .from('session_index')
    .insert({
      session_id: sessionId,
      user_id: userId,
      event_count: eventCount,
      started_at: new Date().toISOString(),
    })

  if (insertError) {
    // Conflict = session already exists — update event_count only
    if (insertError.code === '23505') {
      const { error: updateError } = await (supabase as any)
        .from('session_index')
        .update({ event_count: eventCount })
        .eq('session_id', sessionId)

      if (updateError) {
        log.agent('Session index update failed', { sessionId, error: updateError.message }, 'warn')
      }
    } else {
      log.agent('Session index insert failed', { sessionId, error: insertError.message }, 'warn')
    }
  }
}

/**
 * Compute session distance for a given session_id relative to the current session.
 * Returns a map of session_id → distance (0 = current, 1 = previous, etc.)
 */
const getSessionDistances = async (
  userId: string,
  currentSessionId: string
): Promise<Map<string, number>> => {
  const supabase = getAdminClient()

  // session_index table added by migration 031 — not yet in generated types
  const { data, error } = await (supabase as any)
    .from('session_index')
    .select('session_id')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(20) // enough history for decay computation

  if (error || !data) return new Map([[currentSessionId, 0]])

  const distances = new Map<string, number>()
  const rows = data as Array<{ session_id: string }>
  for (let i = 0; i < rows.length; i++) {
    distances.set(rows[i].session_id, i)
  }

  // Ensure current session is distance 0 even if not yet in index
  if (!distances.has(currentSessionId)) {
    distances.set(currentSessionId, 0)
  }

  return distances
}

// =============================================================================
// F3: Session Distance Decay
// =============================================================================

/** Decay curve: session distance → decay factor */
const DECAY_CURVE: Record<number, number> = {
  0: 1.0,
  1: 0.9,
  2: 0.75,
  3: 0.5,
  4: 0.4,
  5: 0.3,
}

/** Get decay factor for a given session distance. Clamps at max defined distance. */
const getDecayFactor = (distance: number): number => {
  if (distance <= 0) return 1.0
  if (distance >= 5) return DECAY_CURVE[5]
  return DECAY_CURVE[distance] ?? DECAY_CURVE[5]
}

/**
 * Apply session-distance decay to all enriched knowledge for this user.
 * - Preferences: EXEMPT from decay (F3.2)
 * - Domain: half-rate decay (F3.3)
 * - Operational: full decay (F3.1)
 *
 * Updates attention_score in knowledge_current directly.
 * Runs during Cartographer enrichment, not per-turn (F3.7).
 */
const applySessionDecay = async (
  userId: string,
  currentSessionId: string
): Promise<{ decayed: number; skipped: number }> => {
  const supabase = getAdminClient()
  const sessionDistances = await getSessionDistances(userId, currentSessionId)

  // Single query: base_attention + promotion_count (both from migration 031, not in generated types)
  const { data, error } = await (supabase as any)
    .from('knowledge_current')
    .select('event_id, session_id, knowledge_type, attention_score, base_attention, promotion_count')
    .eq('user_id', userId)
    .not('knowledge_type', 'is', null)
    .neq('knowledge_type', 'preference')
    .gt('attention_score', 0)

  if (error || !data) {
    log.agent('Decay: failed to load events', { error: error?.message }, 'warn')
    return { decayed: 0, skipped: 0 }
  }

  type DecayRow = {
    event_id: string
    session_id: string | null
    knowledge_type: string
    attention_score: number
    base_attention: number | null
    promotion_count: number | null
  }

  /** Cold-knowledge threshold: sessions without retrieval hits before extra decay */
  const COLD_KNOWLEDGE_SESSIONS = 5
  /** Extra decay per session beyond cold threshold for unretrieved domain knowledge */
  const COLD_DECAY_PER_SESSION = 0.1

  let decayed = 0
  let skipped = 0

  for (const row of data as DecayRow[]) {
    if (!row.session_id) { skipped++; continue }

    const distance = sessionDistances.get(row.session_id) ?? 6 // unknown sessions = max decay
    if (distance === 0) { skipped++; continue } // current session, no decay

    // Decay from ORIGINAL Stage 1 score, not previously-decayed value.
    // Fallback to attention_score for pre-migration events without base_attention.
    const originalAttention = row.base_attention ?? row.attention_score
    const rawFactor = getDecayFactor(distance)

    // Domain decays at half rate (F3.3): interpolate between 1.0 and rawFactor
    const factor = row.knowledge_type === 'domain'
      ? 1.0 - (1.0 - rawFactor) * 0.5
      : rawFactor

    let decayedAttention = Math.round(originalAttention * factor * 100) / 100

    // F5.3: Cold-knowledge decay for domain items with no retrieval hits
    if (row.knowledge_type === 'domain' && distance >= COLD_KNOWLEDGE_SESSIONS) {
      if ((row.promotion_count ?? 0) === 0) {
        const extraDecay = (distance - COLD_KNOWLEDGE_SESSIONS + 1) * COLD_DECAY_PER_SESSION
        decayedAttention = Math.max(0, Math.round((decayedAttention - extraDecay) * 100) / 100)
      }
    }

    // Only update if decay changed the score
    if (decayedAttention !== row.attention_score) {
      const { error: updateError } = await supabase
        .from('knowledge_current')
        .update({
          attention_score: decayedAttention,
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', row.event_id)

      if (!updateError) decayed++
      else skipped++
    } else {
      skipped++
    }
  }

  return { decayed, skipped }
}

// =============================================================================
// F3: Preference Superseding
// =============================================================================

/** Cosine similarity between two normalized vectors (text-embedding-3-small is L2-normalized) */
const cosineSimilarity = (a: number[], b: number[]): number => {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}

/**
 * Check new preference assessments against existing preferences.
 * If cosine similarity >= 0.85, supersede the old preference:
 * - Old preference attention → 0.0
 * - Old preference superseded_by → new event ID (F3.5)
 */
const checkPreferenceSuperseding = async (
  assessments: Stage1Assessment[],
  userId: string
): Promise<number> => {
  const supabase = getAdminClient()
  const openai = getOpenAI()

  const newPreferences = assessments.filter((a) => a.knowledgeType === 'preference')
  if (newPreferences.length === 0) return 0

  // Load existing preferences with their embeddings via search RPC
  // We need the embeddings for cosine comparison, but they're stored as pgvector.
  // Instead, generate embeddings for existing preference content and compare in TS.
  const { data: existingPrefs, error } = await supabase
    .from('knowledge_current')
    .select('event_id, content, context_snippet')
    .eq('user_id', userId)
    .eq('knowledge_type', 'preference')
    .gt('attention_score', 0)
    .is('superseded_by', null)

  if (error || !existingPrefs || existingPrefs.length === 0) return 0

  // Batch-embed existing preference snippets for comparison
  const existingTexts = existingPrefs.map((p) =>
    (p.context_snippet as string) || (p.content as string).slice(0, 200)
  )

  let existingEmbeddings: number[][]
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: existingTexts,
    })
    existingEmbeddings = response.data.map((d) => d.embedding)
  } catch {
    log.agent('Failed to embed existing preferences for superseding check', {}, 'warn')
    return 0
  }

  let supersededCount = 0

  for (const newPref of newPreferences) {
    // Generate embedding for the new preference's context snippet
    const textToEmbed = newPref.contextSnippet || 'preference'
    let newEmbedding: number[]
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: textToEmbed,
      })
      newEmbedding = response.data[0].embedding
    } catch {
      continue
    }

    // Compare against each existing preference
    for (let i = 0; i < existingPrefs.length; i++) {
      const existing = existingPrefs[i]
      if (existing.event_id === newPref.eventId) continue

      const similarity = cosineSimilarity(newEmbedding, existingEmbeddings[i])

      if (similarity >= 0.85) {
        // Supersede: drop old attention to 0.0, set superseded_by (F3.4, F3.5)
        // superseded_by added by migration 031 — not yet in generated types
        const { error: updateError } = await (supabase as any)
          .from('knowledge_current')
          .update({
            attention_score: 0.0,
            superseded_by: newPref.eventId,
            updated_at: new Date().toISOString(),
          })
          .eq('event_id', existing.event_id)

        if (!updateError) {
          supersededCount++
          log.agent('Preference superseded', {
            old: existing.event_id,
            new: newPref.eventId,
            similarity: similarity.toFixed(3),
          })
        }
      }
    }
  }

  return supersededCount
}

// =============================================================================
// F4: Retrieval Feedback Loop (batch promotion)
// =============================================================================

/**
 * Process retrieval feedback from recently completed agent_tasks.
 * For each completed task's result event_ids, check if they were in the
 * prompt window during the dispatching session. If not → bump promotion_count.
 *
 * Runs during Cartographer enrichment cycle (F4.8).
 */
const processRetrievalFeedback = async (
  userId: string,
  currentSessionId: string
): Promise<{ promoted: number }> => {
  const supabase = getAdminClient()

  // Find recently completed agent_tasks for this user (last 24h)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: tasks, error: tasksError } = await supabase
    .from('agent_tasks')
    .select('id, result, conversation_id')
    .eq('user_id', userId)
    .eq('status', 'complete')
    .gte('completed_at', cutoff)

  if (tasksError || !tasks || tasks.length === 0) return { promoted: 0 }

  // Collect all event_ids found by retrieval across completed tasks
  const retrievedEventIds = new Set<string>()
  const sessionIds = new Set<string>()

  for (const task of tasks) {
    const result = task.result as { findings?: Array<{ eventId?: string }> } | null
    if (!result?.findings) continue

    sessionIds.add(task.conversation_id as string)

    for (const finding of result.findings) {
      if (finding.eventId) {
        retrievedEventIds.add(finding.eventId)
      }
    }
  }

  if (retrievedEventIds.size === 0) return { promoted: 0 }

  // Load the prompt window event_ids that were active during those sessions.
  // Prompt window = high-attention events (>= 0.5) that existed at task dispatch time.
  // Approximation: events from the dispatching session's user with high attention.
  const { data: windowEvents, error: windowError } = await supabase
    .from('knowledge_current')
    .select('event_id')
    .eq('user_id', userId)
    .gte('attention_score', 0.5)
    .in('session_id', Array.from(sessionIds))

  const windowEventIds = new Set(
    (windowEvents ?? []).map((e) => e.event_id as string)
  )

  // Also include high-attention events that would have been pre-loaded
  // (pinned + preferences — these are always in the window)
  const { data: preloaded } = await supabase
    .from('knowledge_current')
    .select('event_id')
    .eq('user_id', userId)
    .or('attention_score.gte.0.9,knowledge_type.eq.preference')

  for (const p of preloaded ?? []) {
    windowEventIds.add(p.event_id as string)
  }

  // Promote events found by retrieval but NOT in the window (F4.9)
  let promoted = 0
  const retrievedArray = Array.from(retrievedEventIds)
  for (const eventId of retrievedArray) {
    if (windowEventIds.has(eventId)) continue

    // Atomic increment via SQL RPC (F4.2)
    // increment_promotion_count added by migration 031 — not yet in generated types
    const { error: promoteError } = await (supabase as any).rpc('increment_promotion_count', {
      p_event_id: eventId,
    })

    if (promoteError) {
      log.agent('Promotion increment failed', { eventId, error: promoteError.message }, 'warn')
      continue
    }

    promoted++
  }

  log.agent('Retrieval feedback processed', {
    tasksChecked: tasks.length,
    retrievedEvents: retrievedEventIds.size,
    windowEvents: windowEventIds.size,
    promoted,
  }, 'debug')

  return { promoted }
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

  // Apply Stage 1 enrichments — atomic per event
  // Re-embed FIRST (risky), then update metadata only on success
  let successCount = 0
  let failCount = 0

  for (const assessment of assessments) {
    try {
      // Re-embed with context_snippet prepended (the risky part)
      const originalContent = contentMap.get(assessment.eventId)
      if (originalContent && assessment.contextSnippet) {
        const textToEmbed = `${assessment.contextSnippet} ${originalContent}`
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: textToEmbed,
        })
        const embedding = response.data[0].embedding

        await supabase.rpc('update_knowledge_embedding', {
          p_event_id: assessment.eventId,
          p_embedding: toVectorString(embedding),
        })
      }

      // Only update metadata after successful re-embed
      await updateKnowledgeEnrichment(assessment.eventId, {
        knowledgeType: assessment.knowledgeType,
        attentionScore: assessment.attentionScore,
        contextSnippet: assessment.contextSnippet || undefined,
      })
      successCount++
    } catch (err) {
      log.agent('Event enrichment failed, will retry next run', {
        eventId: assessment.eventId,
        error: String(err),
      }, 'warn')
      failCount++
    }
  }

  if (failCount > 0) {
    log.agent('Enrichment summary', { successCount, failCount })
  }

  // Apply Stage 2 connections as typed edges
  for (const conn of connections) {
    try {
      await createEdge(conn.fromEventId, conn.toEventId, conn.edgeType, 'cartographer')
    } catch (err) {
      log.agent('Edge creation failed', { from: conn.fromEventId, to: conn.toEventId, edgeType: conn.edgeType, error: String(err) }, 'warn')
    }
  }
}

// =============================================================================
// Main Entry Point
// =============================================================================

export const runCartographer = async (payload: CartographerPayload): Promise<void> => {
  const { sessionId, userId, voyageSlug } = payload
  const startTime = Date.now()

  log.agent('Cartographer triggered', { sessionId, userId })

  try {
    // Load unenriched knowledge events from knowledge_current
    const events = await loadUnenrichedEvents(sessionId, userId)
    if (events.length === 0) {
      log.agent('No unenriched events found, skipping', { sessionId })
      return
    }

    // Build purpose-built enrichment window
    const oldestUnenrichedTime = events[0].source_created_at
    const transcript = await buildEnrichmentWindow(sessionId, oldestUnenrichedTime, userId, voyageSlug)
    if (!transcript) {
      log.agent('No transcript available, skipping', { sessionId })
      return
    }

    log.agent('Running Stage 1', { eventCount: events.length })

    // Stage 1: Per-event assessment (pure reasoning)
    const assessments = await runStage1(transcript, events, userId)
    log.agent('Stage 1 complete', { assessmentCount: assessments.length })

    // Stage 2: Relationship mapping (agentic with tools)
    const toolCtx: ToolContext = { userId, voyageSlug, conversationId: sessionId }
    log.agent('Running Stage 2', { assessmentCount: assessments.length })

    const connections = await runStage2(assessments, toolCtx)
    log.agent('Stage 2 complete', { connectionCount: connections.length })

    // Apply enrichments + re-embed + connect
    await applyEnrichments(assessments, connections, events)

    // F3: Upsert session index for decay computation
    await upsertSessionIndex(sessionId, userId, events.length)

    // F3: Apply session distance decay (operational + domain, preferences exempt)
    const decayResult = await applySessionDecay(userId, sessionId)
    log.agent('Decay applied', decayResult)

    // F3: Check preference superseding (cosine >= 0.85)
    const supersededCount = await checkPreferenceSuperseding(assessments, userId)
    if (supersededCount > 0) {
      log.agent('Preferences superseded', { count: supersededCount })
    }

    // F4: Process retrieval feedback (batch promotion from agent_tasks)
    const feedbackResult = await processRetrievalFeedback(userId, sessionId)
    if (feedbackResult.promoted > 0) {
      log.agent('Retrieval promotions', feedbackResult)
    }

    const durationMs = Date.now() - startTime
    log.agent('Cartographer complete', {
      sessionId,
      events: events.length,
      assessments: assessments.length,
      connections: connections.length,
      decayed: decayResult.decayed,
      superseded: supersededCount,
      promoted: feedbackResult.promoted,
      durationMs,
    })
  } catch (err) {
    log.agent('Cartographer failed', {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    }, 'error')
    // Fire-and-forget: never throw
  }
}
