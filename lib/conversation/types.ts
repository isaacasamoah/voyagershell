import type { SessionStatus } from '@/lib/supabase/types'
import type { ConversationMessage } from './stream-context'

export interface ConversationOptions {
  voyageSlug?: string
}

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
