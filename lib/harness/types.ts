import type { StreamTextResult, ToolSet } from 'ai'
import type { AuthState } from '@/lib/prompts'

export interface SimpleMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface TurnContext {
  userId: string
  conversationId?: string
  voyageSlug: string | null
  authState?: AuthState
  autoSent?: boolean
  messages: SimpleMessage[]
  displayName?: string
}

export interface HarnessHost {
  defer(promise: Promise<unknown>): void
  now(): Date
}

export type TurnResult =
  | { kind: 'stream'; result: StreamTextResult<ToolSet, any> }
  | { kind: 'text'; text: string }
  | { kind: 'empty' }
