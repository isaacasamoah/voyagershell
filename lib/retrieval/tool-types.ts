export interface ToolContext {
  userId: string
  voyageSlug?: string
  conversationId?: string
  /** Vercel waitUntil for background execution without blocking response. */
  waitUntil?: (promise: Promise<unknown>) => void
  /** Conversation messages captured by spawn_background_agent. */
  messages?: Array<{ role: string; content: string }>
}

export interface ToolRegistration {
  name: string
  tool: any
  strategyHint: string
}
