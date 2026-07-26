import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { UIMessage } from 'ai'
import {
  countAssistantEvents,
  isHydratedMessage,
  type FeedEvent,
} from '@/lib/messaging/feed-types'
import { getAskCaptainParts, getMessageText } from '../message-parts'
import { useStreamingReply } from './useStreamingReply'

interface LiveConversationInput {
  messages: UIMessage[]
  feedEvents: FeedEvent[]
  isStreaming: boolean
  conversationId: string | null
  streamRef: RefObject<HTMLDivElement>
  composing: boolean
  shellHeight: number | null
}

export const useLiveConversation = ({
  messages,
  feedEvents,
  isStreaming,
  conversationId,
  streamRef,
  composing,
  shellHeight,
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
  const feedEventCount = feedEvents.length
  const streamingReplyId = streamingReply?.id ?? null
  useEffect(() => {
    const stream = streamRef.current
    if (!stream) return
    stream.scrollTo({ top: stream.scrollHeight, behavior: 'smooth' })
  }, [
    streamRef,
    feedEventCount,
    streamingReplyId,
    composing,
    shellHeight,
  ])
  return streamingReply
}
