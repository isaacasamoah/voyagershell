'use client'

import type { UIMessage } from 'ai'
import { AssistantMessage, UserMessage } from '@/components/chat'
import type { MessagePart } from '@/components/chat/AssistantMessage'
import type {
  FeedEvent,
  StreamingReply,
} from '@/lib/messaging/feed-types'
import {
  isHydratedMessage,
  shouldShowOptimisticUser,
  shouldShowStreamingReply,
} from '@/lib/messaging/feed-types'
import { resolveComposerAudience } from '@/lib/messaging/address'
import type { AskCaptainInput } from '@/lib/tools/captain'
import { AskCaptainRenderer } from './AskCaptainRenderer'
import { getAskCaptainParts, getMessageText } from './message-parts'

interface VoyagerLiveTurnProps {
  messages: UIMessage[]
  feedEvents: FeedEvent[]
  streamingReply: StreamingReply | null
  isStreaming: boolean
  ownVoyagerHandle: string
  ownVoyagerDisplayName: string | null
  roomPeople: string[]
  messageQueue: string[]
  sendMagicLink: (
    email: string,
  ) => Promise<{ success: boolean; error?: string }>
  onSendMessage: (text: string) => void
  onVoyageSwitch: (slug: string | null) => void
  onNewConversation: () => Promise<boolean>
  onResumeConversation: (conversationId: string) => Promise<boolean>
  onComponentAction: (action: string, data?: unknown) => void
}

const buildAssistantParts = (
  message: UIMessage,
  content: string,
  input: VoyagerLiveTurnProps,
): MessagePart[] | null => {
  const captainParts = getAskCaptainParts(message)
  if (captainParts.length === 0) return null
  const messageParts: MessagePart[] = content
    ? [{ type: 'text', text: content }]
    : []
  captainParts.forEach((part) => {
    messageParts.push({
      type: 'react',
      element: (
        <AskCaptainRenderer
          key={part.toolCallId}
          input={part.input as AskCaptainInput}
          toolState={part.state}
          toolResult={part.result}
          toolCallId={part.toolCallId}
          sendMagicLink={input.sendMagicLink}
          onSendMessage={input.onSendMessage}
          onVoyageSwitch={input.onVoyageSwitch}
          onNewConversation={input.onNewConversation}
          onResumeConversation={input.onResumeConversation}
        />
      ),
    })
  })
  return messageParts
}

export const VoyagerLiveTurn = (input: VoyagerLiveTurnProps) => {
  const optimisticUser = [...input.messages].reverse().find((message) => (
    message.role === 'user' && !isHydratedMessage(message)
  ))
  const optimisticContent = optimisticUser
    ? getMessageText(optimisticUser)
    : ''
  const showOptimistic = optimisticUser && shouldShowOptimisticUser(
    optimisticContent,
    input.feedEvents,
    input.ownVoyagerHandle,
  )
  const audience = showOptimistic
    ? resolveComposerAudience(
      optimisticContent,
      {
        ownVoyagerHandle: input.ownVoyagerHandle,
        ownVoyagerAliases: ['voyager'],
      },
      input.roomPeople,
    )
    : null
  const showReply = shouldShowStreamingReply(
    input.streamingReply,
    input.feedEvents,
  )
  const streamingMessage = showReply
    ? input.messages.find((message) => message.id === input.streamingReply?.id)
    : null
  const streamingContent = streamingMessage
    ? getMessageText(streamingMessage)
    : ''
  const parts = streamingMessage
    ? buildAssistantParts(streamingMessage, streamingContent, input)
    : null
  return (
    <>
      {showOptimistic && optimisticUser && audience && (
        <UserMessage
          key={`optimistic-${optimisticUser.id}`}
          content={optimisticContent}
          timestamp="LIVE"
          username="you"
          audienceLabel={audience.label}
        />
      )}
      {input.messageQueue.map((queued, index) => (
        <UserMessage
          key={`queued-${index}`}
          content={queued}
          timestamp="QUEUED"
          username="you"
        />
      ))}
      {showReply && input.streamingReply && streamingMessage
        && (streamingContent || parts) && (
        <AssistantMessage
          key={`streaming-${input.streamingReply.id}`}
          content={parts ? undefined : streamingContent}
          parts={parts ?? undefined}
          timestamp="LIVE"
          isStreaming={input.isStreaming}
          onAction={input.onComponentAction}
          voyagerName={input.ownVoyagerDisplayName}
          audienceLabel="Only you + your Voyager"
        />
      )}
    </>
  )
}
