// API response types for conversation endpoints
// Shared between client (VoyagerInterface) and server (app/api/conversation/)

export interface ConversationData {
  id: string
  title: string | null
  status: string
  messageCount: number
  lastMessageAt: string
  createdAt: string
}

export interface MessageData {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface ConversationResponse {
  conversation: ConversationData
  messages: MessageData[]
}
