// Read-only discovery of resumable conversation sessions.

import {
  getFeedEventSessionId,
} from '@/lib/messaging/feed-rows'
import { queryScopedEventsForConversations } from '@/lib/messaging/feed-queries'
import {
  composeContextRows,
  type ConversationMessage,
} from './stream-context'
import { sessionAuthority, SessionAccessError } from './session-authority'
import type {
  ConversationOptions,
  ResumableConversation,
} from './types'

/**
 * Get resumable conversations for a user.
 * Returns conversations ordered by recency with preview text.
 * If voyageSlug is provided, returns only voyage-scoped conversations.
 */
export const getResumableConversations = async (
  userId: string,
  limit = 10,
  options?: ConversationOptions,
): Promise<ResumableConversation[]> => {
  const { voyageSlug } = options ?? {}

  console.log(
    '[Conversation] Getting resumable conversations for user:',
    userId,
    'voyage:',
    voyageSlug ?? 'personal',
  )

  try {
    const fetchLimit = Math.min(Math.max(limit * 5, limit), 100)
    const sessionRows = await sessionAuthority.listResumable(
      userId,
      voyageSlug ?? null,
      fetchLimit,
    )
    if (sessionRows.length === 0) {
      console.log('[Conversation] No resumable conversations found')
      return []
    }

    const sessionIds = sessionRows.map((row) => row.id)
    const canonicalVoyageSlug = sessionRows[0].voyage_slug
    const eventRows = await queryScopedEventsForConversations(
      userId,
      sessionIds,
      canonicalVoyageSlug,
    )
    const eventRowsBySession = new Map<string, typeof eventRows>()
    eventRows.forEach((row) => {
      const sessionId = getFeedEventSessionId(row)
      if (!sessionId) return
      const rows = eventRowsBySession.get(sessionId) ?? []
      rows.push(row)
      eventRowsBySession.set(sessionId, rows)
    })

    const conversations = sessionRows
      .map((row): ResumableConversation | null => {
        const messages: ConversationMessage[] = composeContextRows(
          eventRowsBySession.get(row.id) ?? [],
          userId,
          row.id,
        )
        const firstMessage = messages[0]
        const lastMessage = messages.at(-1)
        if (!lastMessage) return null
        return {
          id: row.id,
          title: row.title,
          status: row.status,
          messageCount: messages.length,
          lastMessageAt: lastMessage.createdAt,
          createdAt: new Date(row.created_at),
          preview: firstMessage ? firstMessage.content.slice(0, 100) : null,
        }
      })
      .filter((row): row is ResumableConversation => row !== null)
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())
      .slice(0, limit)

    console.log(
      '[Conversation] Found',
      conversations.length,
      'resumable conversations',
    )
    return conversations
  } catch (error) {
    if (error instanceof SessionAccessError) throw error
    console.error('[Conversation] getResumableConversations error:', error)
    return []
  }
}
