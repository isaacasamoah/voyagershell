// Knowledge Events service for Slice 2 Phase 1
// Creates source events in the event-sourced knowledge system
//
// Philosophy: "Curation is subtraction, not extraction"
// - Messages ARE the knowledge (preserved exactly)
// - Classifications are metadata on source events
// - Fire-and-forget pattern — never blocks the chat flow

import OpenAI from 'openai'
import { getAdminClient } from '@/lib/supabase/admin'
import type { MessageRole, Json } from '@/lib/supabase/types'

// Admin client for event creation (internal operations, often without user context)
// User-scoped operations use authenticated client in search.ts
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

// Source event types — these contain THE ACTUAL KNOWLEDGE
export type SourceEventType =
  | 'conversation'   // Chat turns (user + assistant) — Cartographer enriches these
  | 'message'        // Inter-user messages via send_message
  | 'document'       // Google Docs, Notion, etc.
  | 'slack_message'  // Slack message/thread
  | 'jira_update'    // Jira ticket/comment
  | 'explicit'       // User explicitly adds knowledge

export type EventType = SourceEventType

// Classification types — METADATA on source events, not extraction
export type Classification =
  | 'fact'       // Message contains verified information
  | 'preference' // Message expresses preference
  | 'decision'   // Message contains a choice
  | 'procedure'  // Message describes how-to
  | 'insight'    // Message contains learning
  | 'entity'     // Message mentions key people/systems

// Actor types for attribution
export type ActorType = 'user' | 'voyager' | 'system' | 'pipeline'

// Source types for provenance
export type SourceType = 'conversation' | 'slack' | 'jira' | 'document' | 'explicit'

// Metadata for source events
export interface SourceEventMetadata {
  classifications?: Classification[]
  entities?: string[]
  topics?: string[]
  session_id?: string
  message_id?: string
  addressed_to?: string[]  // V3 messaging: target user IDs
  source?: string          // V3 messaging: originating channel/context
  sender_display_name?: string  // V6: human-readable sender name
  sender_user_id?: string       // V6: sender UUID for attribution
}

// =============================================================================
// Embedding Generation (async, for search)
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const updateSessionActivity = async (conversationId: string): Promise<void> => {
  if (!UUID_RE.test(conversationId)) return

  const timestamp = new Date().toISOString()
  const { error } = await getAdminSupabase()
    .from('sessions')
    .update({
      last_message_at: timestamp,
      updated_at: timestamp,
    })
    .eq('id', conversationId)

  if (error) {
    console.error('[Knowledge] Failed to update session activity:', error)
  }
}

// =============================================================================
// Source Event Creation
// =============================================================================

interface CreateSourceEventParams {
  eventType: SourceEventType
  content: string
  userId?: string
  voyageSlug?: string
  participants?: string[]  // NULL = public within voyage, array = scoped to listed users
  metadata?: SourceEventMetadata
  sourceType?: SourceType
  sourceRef?: Record<string, unknown>
  actorId?: string
  actorType?: ActorType
}

/**
 * Create a source event in knowledge_events.
 * The trigger will automatically create the knowledge_current row.
 *
 * For Phase 1, embeddings are generated inline and updated after creation.
 * Phase 2 will move this to an async pipeline.
 */
export const createSourceEvent = async (params: CreateSourceEventParams): Promise<string | null> => {
  const {
    eventType,
    content,
    userId,
    voyageSlug,
    participants,
    metadata = {},
    sourceType = 'conversation',
    sourceRef,
    actorId,
    actorType = 'user',
  } = params

  try {
    const supabase = getAdminSupabase()

    // Insert the source event
    // The trigger creates knowledge_current row with the content + propagates participants
    const { data, error } = await supabase
      .from('knowledge_events')
      .insert({
        event_type: eventType,
        content: content,
        user_id: userId,
        voyage_slug: voyageSlug,
        participants: participants ?? null,
        metadata: {
          ...metadata,                                  // pass through all fields
          classifications: metadata.classifications ?? [],  // override with defaults
          entities: metadata.entities ?? [],
          topics: metadata.topics ?? [],
        },
        source_type: sourceType,
        source_ref: sourceRef as Json | undefined,
        actor_id: actorId,
        actor_type: actorType,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[Knowledge] Failed to create source event:', error)
      return null
    }

    const eventId = data.id as string
    console.log('[Knowledge] Source event created:', eventId)

    // Generate and update embedding (async but inline for v1)
    // Phase 2: Move to background job
    try {
      const embedding = await generateEmbedding(content)

      
      await supabase.rpc('update_knowledge_embedding', {
        p_event_id: eventId,
        p_embedding: toVectorString(embedding),
      })
      console.log('[Knowledge] Embedding updated for:', eventId)
    } catch (embedError) {
      // Log but don't fail — search will work once embedding is added
      console.error('[Knowledge] Failed to generate embedding:', embedError)
    }

    return eventId
  } catch (error) {
    console.error('[Knowledge] Error creating source event:', error)
    return null
  }
}

/**
 * Create a message source event.
 * Persists a conversation-scoped source event.
 *
 * FIRE-AND-FORGET — should never block the chat response.
 */
export const createMessageEvent = async (
  conversationId: string,
  role: MessageRole,
  content: string,
  options?: {
    userId?: string
    voyageSlug?: string
    participants?: string[]
    classifications?: Classification[]
    addressedTo?: string[]
    source?: string
    // V6: inline classification + sender attribution
    senderDisplayName?: string
    senderUserId?: string
    attentionScore?: number
    contextSnippet?: string
    /** Override event type. Default: 'message'. Use 'conversation' for chat turns. */
    eventType?: SourceEventType
  }
): Promise<string | null> => {
  const eventType = options?.eventType ?? 'message'
  console.log(`[Knowledge] Creating ${eventType} event for conversation:`, conversationId)

  const eventId = await createSourceEvent({
    eventType,
    content: content,
    userId: options?.userId,
    voyageSlug: options?.voyageSlug,
    participants: options?.participants,
    metadata: {
      classifications: options?.classifications ?? [],
      session_id: conversationId,
      addressed_to: options?.addressedTo,
      source: options?.source,
      sender_display_name: options?.senderDisplayName,
      sender_user_id: options?.senderUserId,
    },
    sourceType: 'conversation',
    sourceRef: {
      conversation_id: conversationId,
      role: role,
    },
    actorType: role === 'user' ? 'user' : 'voyager',
  })

  if (eventId && (eventType === 'conversation' || eventType === 'message')) {
    await updateSessionActivity(conversationId)
  }

  // V6: Post-INSERT enrichment for attention_score + context_snippet
  // Same dual-write pattern as embeddings: INSERT (trigger) then UPDATE (enrichment)
  if (eventId && options?.attentionScore !== undefined) {
    try {
      await updateKnowledgeEnrichment(eventId, {
        attentionScore: options.attentionScore,
        contextSnippet: options.contextSnippet,
        // knowledgeType intentionally omitted — messages leave it NULL (D23)
      })
    } catch (enrichError) {
      console.error('[Knowledge] Message enrichment failed (non-blocking):', enrichError)
    }
  }

  return eventId
}

/**
 * Create an explicit knowledge event.
 * For when users explicitly say "remember this" or captains add knowledge.
 */
export const createExplicitEvent = async (
  content: string,
  options: {
    userId?: string
    voyageSlug?: string
    classifications?: Classification[]
    sessionId?: string
  }
): Promise<string | null> => {
  console.log('[Knowledge] Creating explicit event')

  const eventId = await createSourceEvent({
    eventType: 'explicit',
    content: content,
    userId: options.userId,
    voyageSlug: options.voyageSlug,
    metadata: {
      classifications: options.classifications ?? [],
      session_id: options.sessionId,
    },
    sourceType: 'explicit',
    actorType: 'user',
  })

  // Explicit events (remember_knowledge) always get attention 1.0 + preference type
  // Same dual-write pattern as createMessageEvent: INSERT (trigger) then UPDATE (enrichment)
  if (eventId) {
    try {
      await updateKnowledgeEnrichment(eventId, {
        knowledgeType: 'preference',
        attentionScore: 1.0,
        contextSnippet: `Explicit preference: ${content.slice(0, 100)}`,
      })
    } catch (enrichError) {
      console.error('[Knowledge] Explicit event enrichment failed (non-blocking):', enrichError)
    }
  }

  return eventId
}

// =============================================================================
// Knowledge Enrichment (Cartographer Updates)
// =============================================================================

export type KnowledgeType = 'domain' | 'operational' | 'preference'

interface KnowledgeEnrichmentParams {
  knowledgeType?: KnowledgeType  // Optional: messages leave NULL (D23 — Cartographer skips via event_type filter)
  attentionScore: number
  contextSnippet?: string
}

/**
 * Update knowledge_current row with enrichment from the Cartographer.
 * Sets knowledge_type, attention_score, and optionally context_snippet.
 */
export const updateKnowledgeEnrichment = async (
  eventId: string,
  params: KnowledgeEnrichmentParams
): Promise<boolean> => {
  try {
    const supabase = getAdminSupabase()

    const update: Record<string, unknown> = {
      attention_score: params.attentionScore,
      base_attention: params.attentionScore, // F3: preserve original Stage 1 score for idempotent decay
      updated_at: new Date().toISOString(),
    }

    // Only set knowledge_type when provided (messages leave it NULL — D23)
    if (params.knowledgeType) {
      update.knowledge_type = params.knowledgeType
    }

    if (params.contextSnippet) {
      update.context_snippet = params.contextSnippet
    }

    const { error } = await supabase
      .from('knowledge_current')
      .update(update)
      .eq('event_id', eventId)

    if (error) {
      console.error('[Knowledge] Failed to update enrichment:', error)
      return false
    }

    console.log(`[Knowledge] Enrichment updated for ${eventId}: type=${params.knowledgeType}, attention=${params.attentionScore}`)
    return true
  } catch (error) {
    console.error('[Knowledge] Error updating enrichment:', error)
    return false
  }
}

// =============================================================================
// Fire-and-Forget Wrapper
// =============================================================================

/**
 * Emit a message event without blocking.
 * Use this in the chat route after saving messages.
 */
export const emitMessageEvent = (
  conversationId: string,
  role: MessageRole,
  content: string,
  options?: {
    userId?: string
    voyageSlug?: string
    participants?: string[]
    classifications?: Classification[]
    addressedTo?: string[]
    source?: string
    senderDisplayName?: string
    senderUserId?: string
    attentionScore?: number
    contextSnippet?: string
    eventType?: SourceEventType
  }
): void => {
  // Fire and forget — don't await
  createMessageEvent(conversationId, role, content, options).catch((error) => {
    console.error('[Knowledge] emitMessageEvent error (non-blocking):', error)
  })
}
