// Conversation session creation, archival, and atomic resumption.

import type { SessionAuthorityRow } from '@/lib/supabase/schema/functions'
import { composeContextFromStream, type ConversationMessage } from './stream-context'
import { sessionAuthority, SessionAccessError } from './session-authority'
import type {
  Conversation,
  ConversationOptions,
  ConversationWithMessages,
} from './types'

const transformSession = (row: SessionAuthorityRow): Conversation => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  status: row.status,
  messageCount: row.message_count ?? 0,
  lastMessageAt: new Date(row.last_message_at ?? row.created_at),
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at ?? row.created_at),
})

const loadConversationFromStream = async (
  session: SessionAuthorityRow,
  userId: string,
): Promise<ConversationWithMessages> => {
  const conversation = transformSession(session)
  const messages: ConversationMessage[] = await composeContextFromStream(
    userId,
    session.id,
    session.voyage_slug,
  )
  const lastMessage = messages.at(-1)
  return {
    ...conversation,
    messageCount: messages.length,
    lastMessageAt: lastMessage?.createdAt ?? conversation.lastMessageAt,
    messages,
  }
}

/** Get or create the caller's active personal or active-voyage session. */
export const getOrCreateActiveConversation = async (
  userId: string,
  options?: ConversationOptions,
): Promise<ConversationWithMessages | null> => {
  const voyageSlug = options?.voyageSlug ?? null
  console.log(
    '[Conversation] Getting or creating active conversation for user:',
    userId,
    'voyage:',
    voyageSlug ?? 'personal',
  )
  try {
    const session = await sessionAuthority.getOrCreateActive(userId, voyageSlug)
    const conversation = await loadConversationFromStream(session, userId)
    console.log(
      '[Conversation] Loaded conversation with',
      conversation.messages.length,
      'messages',
    )
    return conversation
  } catch (error) {
    if (error instanceof SessionAccessError) throw error
    console.error('[Conversation] getOrCreateActiveConversation error:', error)
    return null
  }
}

/** Move an owned, currently authorized session into resumable history. */
export const archiveConversation = async (
  conversationId: string,
  userId: string,
): Promise<boolean> => {
  console.log('[Conversation] Archiving conversation:', conversationId)
  try {
    const archived = await sessionAuthority.archive(conversationId, userId)
    if (archived) console.log('[Conversation] Conversation archived successfully')
    return archived
  } catch (error) {
    if (error instanceof SessionAccessError) throw error
    console.error('[Conversation] archiveConversation error:', error)
    return false
  }
}

/** Resume and fetch an owned session in one authority-checked transaction. */
export const resumeConversation = async (
  conversationId: string,
  userId: string,
): Promise<ConversationWithMessages | null> => {
  console.log('[Conversation] Resuming conversation atomically:', conversationId)
  try {
    const session = await sessionAuthority.resume(conversationId, userId)
    console.log('[Conversation] Conversation resumed successfully')
    return await loadConversationFromStream(session, userId)
  } catch (error) {
    if (error instanceof SessionAccessError) throw error
    console.error('[Conversation] resumeConversation error:', error)
    return null
  }
}
