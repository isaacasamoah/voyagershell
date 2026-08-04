import type { RefObject } from 'react'
import type { UIMessage } from 'ai'
import {
  countAssistantEvents,
  isHydratedMessage,
  type FeedEvent,
} from '@/lib/messaging/feed-types'
import { getAskCaptainParts, getMessageText } from '../message-parts'
import { useStreamAutoScroll } from './useStreamAutoScroll'
import { useStreamingReply } from './useStreamingReply'

interface LiveConversationInput {
  messages: UIMessage[]
  feedEvents: FeedEvent[]
  isStreaming: boolean
  conversationId: string | null
  streamRef: RefObject<HTMLDivElement>
  queuedCount: number
}

export const useLiveConversation = ({
  messages,
  feedEvents,
  isStreaming,
  conversationId,
  streamRef,
  queuedCount,
}: LiveConversationInput) => {
  const lastAssistant = [...messages].reverse().find((message) => (
    message.role === 'assistant' && !isHydratedMessage(message)
  ))
  const assistantId = lastAssistant?.id ?? null
  const assistantContent = lastAssistant ? getMessageText(lastAssistant) : ''
  const hasCaptainParts = lastAssistant
    ? getAskCaptainParts(lastAssistant).length > 0
    : false
  const assistantEventCount = countAssistantEvents(feedEvents)
  const streamingReply = useStreamingReply({
    assistantId,
    hasRenderableOutput: Boolean(assistantContent || hasCaptainParts),
    isStreaming,
    assistantEventCount,
    conversationId,
  })
  // Every message this client puts on screen for the user: the one the AI SDK
  // just appended, or one parked in the queue while a reply is still running.
  // Hydrated messages are restored history, not something the user just did.
  const ownSend = [...messages].reverse().find((message) => (
    message.role === 'user' && !isHydratedMessage(message)
  ))
  const hasOwnSend = Boolean(ownSend) || queuedCount > 0
  const ownSendKey = hasOwnSend ? `${ownSend?.id ?? ''}:${queuedCount}` : null
  useStreamAutoScroll({ streamRef, ownSendKey })
  return streamingReply
}
