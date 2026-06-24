// Conversation service for Slice 3: Conversation Continuity
// Manages session lifecycle, message persistence, and conversation resumption

import { getAdminClient } from '@/lib/supabase/admin'
import { getClientForContext } from '@/lib/supabase/authenticated'
import { getVoyageBySlug } from '@/lib/voyage'
import type {
  Message,
  ExtendedSession,
  ResumableSession,
  SessionStatus,
  MessageRole,
} from '@/lib/supabase/types'

// Admin client for operations without user context (legacy)
const getAdminSupabase = () => getAdminClient()

// Authenticated client for user-scoped operations
const getClientForUser = (userId: string) => getClientForContext({ userId })

// Options for conversation operations
interface ConversationOptions {
  voyageSlug?: string
}

// Re-export types for convenience
export type { ExtendedSession, ResumableSession, SessionStatus, MessageRole }

// =============================================================================
// Conversation Interface Types
// =============================================================================

export interface Conversation {
  id: string
  userId: string | null
  title: string | null
  status: SessionStatus
  messageCount: number
  lastMessageAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface ConversationMessage {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  createdAt: Date
}

export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[]
}

export interface ResumableConversation {
  id: string
  title: string | null
  status: SessionStatus
  messageCount: number
  lastMessageAt: Date
  createdAt: Date
  preview: string | null
}

// =============================================================================
// Transform Functions
// =============================================================================

const transformSession = (row: ExtendedSession): Conversation => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  status: row.status,
  messageCount: row.message_count ?? 0,
  lastMessageAt: new Date(row.last_message_at ?? row.created_at ?? Date.now()),
  createdAt: new Date(row.created_at ?? Date.now()),
  updatedAt: new Date(row.updated_at ?? Date.now()),
})

const transformMessage = (row: Message): ConversationMessage => ({
  id: row.id,
  conversationId: row.session_id ?? '',
  role: row.role as MessageRole,
  content: row.content,
  createdAt: new Date(row.created_at ?? Date.now()),
})

const transformResumable = (row: ResumableSession): ResumableConversation => ({
  id: row.id,
  title: row.title,
  status: row.status,
  messageCount: row.message_count,
  lastMessageAt: new Date(row.last_message_at),
  createdAt: new Date(row.created_at),
  preview: row.preview,
})

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Get or create the user's active conversation.
 * Returns the session with its messages loaded.
 * If voyageSlug is provided, looks for voyage-scoped session.
 */
export const getOrCreateActiveConversation = async (
  userId: string,
  options?: ConversationOptions
): Promise<ConversationWithMessages | null> => {
  const supabase = getClientForUser(userId)
  const { voyageSlug } = options ?? {}

  console.log('[Conversation] Getting or creating active conversation for user:', userId, 'voyage:', voyageSlug ?? 'personal')

  try {
    // Get voyage ID if in voyage context
    let voyageId: string | null = null
    if (voyageSlug) {
      const voyage = await getVoyageBySlug(voyageSlug)
      voyageId = voyage?.id ?? null
      if (!voyageId) {
        console.error('[Conversation] Voyage not found:', voyageSlug)
      }
    }

    // Look for existing active session (scoped to voyage if specified)
    // Fetch full row directly to avoid redundant query
    
    let query = supabase
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')

    if (voyageId) {
      query = query.eq('voyage_id', voyageId)
    } else {
      query = query.is('voyage_id', null)
    }

    const { data: existingSession } = await query.single()
    let session = existingSession as ExtendedSession | null

    // Create new session if none exists
    if (!session) {
      
      const { data: newSession, error: createError } = await supabase
        .from('sessions')
        .insert({
          user_id: userId,
          status: 'active',
          voyage_id: voyageId,
        })
        .select('*')
        .single()

      if (createError) {
        console.error('[Conversation] Failed to create session:', createError)
        return null
      }

      session = newSession as ExtendedSession
    }

    if (!session) {
      console.error('[Conversation] No session')
      return null
    }

    console.log('[Conversation] Active session ID:', session.id)

    // Fetch messages for this session
    
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })

    if (messagesError) {
      console.error('[Conversation] Messages fetch error:', messagesError)
      return null
    }

    const conversation = transformSession(session)
    const conversationMessages = (messages as Message[]).map(transformMessage)

    console.log(
      '[Conversation] Loaded conversation with',
      conversationMessages.length,
      'messages'
    )

    return {
      ...conversation,
      messages: conversationMessages,
    }
  } catch (error) {
    console.error('[Conversation] getOrCreateActiveConversation error:', error)
    return null
  }
}

/**
 * Load messages for a conversation.
 * Returns messages ordered by creation time (oldest first).
 */
export const loadConversationMessages = async (
  conversationId: string,
  limit = 100
): Promise<ConversationMessage[]> => {
  const supabase = getAdminSupabase()
  console.log('[Conversation] Loading messages for:', conversationId, 'limit:', limit)

  try {
    
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) {
      console.error('[Conversation] loadConversationMessages error:', error)
      return []
    }

    const messages = (data as Message[]).map(transformMessage)
    console.log('[Conversation] Loaded', messages.length, 'messages')

    return messages
  } catch (error) {
    console.error('[Conversation] loadConversationMessages error:', error)
    return []
  }
}

/**
 * Save a message to a conversation.
 * The database trigger will auto-update session metadata.
 */
export const saveMessage = async (
  conversationId: string,
  role: MessageRole,
  content: string
): Promise<ConversationMessage | null> => {
  const supabase = getAdminSupabase()
  console.log('[Conversation] Saving message to:', conversationId, 'role:', role)

  try {
    
    const { data, error } = await supabase
      .from('messages')
      .insert({
        session_id: conversationId,
        role,
        content,
      })
      .select()
      .single()

    if (error) {
      console.error('[Conversation] saveMessage error:', error)
      return null
    }

    const message = transformMessage(data as Message)
    console.log('[Conversation] Message saved:', message.id)

    return message
  } catch (error) {
    console.error('[Conversation] saveMessage error:', error)
    return null
  }
}

/**
 * Archive a conversation (mark as historical).
 * This makes the conversation available for resume but no longer active.
 * Memory extraction can be triggered separately.
 */
export const archiveConversation = async (
  conversationId: string
): Promise<boolean> => {
  const supabase = getAdminSupabase()
  console.log('[Conversation] Archiving conversation:', conversationId)

  try {
    // Direct update - could use transition_session RPC for atomicity
    // Note: Auth is now wired, but direct update works for this use case
    
    const { error } = await supabase
      .from('sessions')
      .update({
        status: 'historical' as SessionStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)

    if (error) {
      console.error('[Conversation] archiveConversation error:', error)
      return false
    }

    console.log('[Conversation] Conversation archived successfully')
    return true
  } catch (error) {
    console.error('[Conversation] archiveConversation error:', error)
    return false
  }
}

/**
 * Get resumable conversations for a user.
 * Returns conversations ordered by recency with preview text.
 * If voyageSlug is provided, returns only voyage-scoped conversations.
 */
export const getResumableConversations = async (
  userId: string,
  limit = 10,
  options?: ConversationOptions
): Promise<ResumableConversation[]> => {
  const supabase = getClientForUser(userId)
  const { voyageSlug } = options ?? {}

  console.log('[Conversation] Getting resumable conversations for user:', userId, 'voyage:', voyageSlug ?? 'personal')

  try {
    // Get voyage ID if in voyage context
    let voyageId: string | null = null
    if (voyageSlug) {
      const voyage = await getVoyageBySlug(voyageSlug)
      voyageId = voyage?.id ?? null
    }

    // Query sessions directly with voyage filtering
    
    let query = supabase
      .from('sessions')
      .select(`
        id,
        title,
        status,
        message_count,
        last_message_at,
        created_at,
        messages!inner (content)
      `)
      .eq('user_id', userId)
      .in('status', ['active', 'historical'])
      .gte('message_count', 1)
      .order('last_message_at', { ascending: false })
      .limit(limit)

    if (voyageId) {
      query = query.eq('voyage_id', voyageId)
    } else {
      query = query.is('voyage_id', null)
    }

    const { data, error } = await query

    if (error) {
      console.error('[Conversation] getResumableConversations error:', error)
      return []
    }

    if (!data || data.length === 0) {
      console.log('[Conversation] No resumable conversations found')
      return []
    }

    // Transform results - extract first message as preview
    interface SessionWithMessages {
      id: string
      title: string | null
      status: SessionStatus
      message_count: number
      last_message_at: string
      created_at: string
      messages: { content: string }[]
    }

    const conversations = (data as SessionWithMessages[]).map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      messageCount: row.message_count,
      lastMessageAt: new Date(row.last_message_at),
      createdAt: new Date(row.created_at),
      preview: row.messages?.[0]?.content?.slice(0, 100) ?? null,
    }))

    console.log('[Conversation] Found', conversations.length, 'resumable conversations')

    return conversations
  } catch (error) {
    console.error('[Conversation] getResumableConversations error:', error)
    return []
  }
}

/**
 * Resume a historical conversation atomically.
 * Uses the resume_session DB RPC — archive current + activate target in one transaction.
 * Both rows transition or neither (no orphaned threads).
 */
export const resumeConversation = async (
  conversationId: string,
  userId: string
): Promise<ConversationWithMessages | null> => {
  const supabase = getClientForUser(userId)
  console.log('[Conversation] Resuming conversation atomically via RPC:', conversationId)

  try {
    // Atomic archive+activate in a single DB transaction.
    // Pass p_user_id explicitly — the server uses the admin client (no JWT),
    // so auth.uid() would be NULL. The RPC accepts p_user_id as the server-side
    // ownership proof (validated by requireAuthResponse before this call).
    const { data: success, error: rpcError } = await supabase.rpc('resume_session', {
      p_session_id: conversationId,
      p_user_id: userId,
    })

    if (rpcError) {
      console.error('[Conversation] resume_session RPC error:', rpcError)
      return null
    }

    if (!success) {
      console.error('[Conversation] resume_session returned false — session not found, not owned, or already archived')
      return null
    }

    // Fetch updated session and messages after atomic transition

    const { data: updatedSession, error: fetchError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', conversationId)
      .single()

    if (fetchError || !updatedSession) {
      console.error('[Conversation] Failed to fetch session after resume:', fetchError)
      return null
    }

    const messages = await loadConversationMessages(conversationId)

    console.log('[Conversation] Conversation resumed successfully')

    return {
      ...transformSession(updatedSession as ExtendedSession),
      messages,
    }
  } catch (error) {
    console.error('[Conversation] resumeConversation error:', error)
    return null
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get a single conversation by ID.
 */
export const getConversation = async (
  conversationId: string
): Promise<Conversation | null> => {
  const supabase = getAdminSupabase()

  try {
    
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', conversationId)
      .single()

    if (error) {
      console.error('[Conversation] getConversation error:', error)
      return null
    }

    return transformSession(data as ExtendedSession)
  } catch (error) {
    console.error('[Conversation] getConversation error:', error)
    return null
  }
}


