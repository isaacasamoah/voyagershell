import type { MessageRole } from '@/lib/supabase/types'
import { updateKnowledgeEnrichment } from './event-enrichment'
import { createSourceEvent, updateSessionActivity } from './event-storage'
import type { Classification, SourceEventType } from './event-types'

interface MessageEventOptions {
  userId?: string
  voyageSlug?: string
  participants?: string[]
  classifications?: Classification[]
  addressedTo?: string[]
  source?: string
  senderDisplayName?: string
  senderUserId?: string
  spaceId?: string
  attentionScore?: number
  contextSnippet?: string
  eventType?: SourceEventType
}

export const createMessageEvent = async (
  conversationId: string,
  role: MessageRole,
  content: string,
  options?: MessageEventOptions,
): Promise<string | null> => {
  const eventType = options?.eventType ?? 'message'
  console.log(`[Knowledge] Creating ${eventType} event for conversation:`, conversationId)

  const eventId = await createSourceEvent({
    eventType,
    content,
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
      space_id: options?.spaceId,
    },
    sourceType: 'conversation',
    sourceRef: {
      conversation_id: conversationId,
      role,
    },
    actorType: role === 'user' ? 'user' : 'voyager',
  })

  if (eventId && options?.userId
      && (eventType === 'conversation' || eventType === 'message')) {
    await updateSessionActivity(conversationId, options.userId)
  }

  if (eventId && options?.attentionScore !== undefined) {
    try {
      await updateKnowledgeEnrichment(eventId, {
        attentionScore: options.attentionScore,
        contextSnippet: options.contextSnippet,
      })
    } catch (error) {
      console.error('[Knowledge] Message enrichment failed (non-blocking):', error)
    }
  }

  return eventId
}

export const createExplicitEvent = async (
  content: string,
  options: {
    userId?: string
    voyageSlug?: string
    classifications?: Classification[]
    sessionId?: string
  },
): Promise<string | null> => {
  console.log('[Knowledge] Creating explicit event')

  const eventId = await createSourceEvent({
    eventType: 'explicit',
    content,
    userId: options.userId,
    voyageSlug: options.voyageSlug,
    metadata: {
      classifications: options.classifications ?? [],
      session_id: options.sessionId,
    },
    sourceType: 'explicit',
    actorType: 'user',
  })

  if (eventId) {
    try {
      await updateKnowledgeEnrichment(eventId, {
        knowledgeType: 'preference',
        attentionScore: 1,
        contextSnippet: `Explicit preference: ${content.slice(0, 100)}`,
      })
    } catch (error) {
      console.error('[Knowledge] Explicit event enrichment failed (non-blocking):', error)
    }
  }

  return eventId
}

export const emitMessageEvent = (
  conversationId: string,
  role: MessageRole,
  content: string,
  options?: MessageEventOptions,
): void => {
  createMessageEvent(conversationId, role, content, options).catch((error) => {
    console.error('[Knowledge] emitMessageEvent error (non-blocking):', error)
  })
}
