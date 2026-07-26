'use client'

import {
  AssistantMessage,
  HumanMessage,
  InviteKnock,
  SystemLine,
  UserMessage,
} from '@/components/chat'
import type { FeedEvent } from '@/lib/messaging/feed-types'

interface VoyagerFeedEventProps {
  event: FeedEvent
  conversationId: string | null
  roomPeople: string[]
  markSeen: (deliveryId: string) => void
  shareToRoom: (sourceEventId: string) => Promise<void>
}

const formatEventTime = (iso: string): string => (
  new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
)

export const VoyagerFeedEvent = ({
  event,
  conversationId,
  roomPeople,
  markSeen,
  shareToRoom,
}: VoyagerFeedEventProps) => {
  const onSeen = event.deliveryId && !event.seen
    ? () => markSeen(event.deliveryId as string)
    : undefined
  if (event.kind === 'system') {
    return <SystemLine content={event.content} onSeen={onSeen} />
  }
  if (event.kind === 'invite') {
    return (
      <InviteKnock
        content={event.content}
        senderName={event.senderDisplayName ?? 'someone'}
        timestamp={event.createdAt}
        inviteState={event.inviteState}
        conversationId={conversationId}
      />
    )
  }
  if (event.role === 'human') {
    return (
      <HumanMessage
        senderName={event.senderDisplayName ?? 'someone'}
        content={event.content}
        timestamp={event.createdAt}
        onSeen={onSeen}
      />
    )
  }
  const timestamp = formatEventTime(event.createdAt)
  if (event.role === 'user') {
    return (
      <UserMessage
        content={event.content}
        timestamp={timestamp}
        username="you"
        audienceLabel={event.eventType === 'conversation'
          ? 'Only you + your Voyager'
          : 'This room'}
      />
    )
  }
  const privateEvent = event.eventType === 'conversation'
  return (
    <AssistantMessage
      content={event.content}
      timestamp={timestamp}
      voyagerName={event.senderDisplayName}
      ownerName={event.ownerName}
      audienceLabel={privateEvent ? 'Only you + your Voyager' : 'This room'}
      shared={event.shared}
      shareTarget={privateEvent && roomPeople.length > 0
        ? `this room · you + ${roomPeople.join(', ')}`
        : undefined}
      onShare={privateEvent && roomPeople.length > 0
        ? () => shareToRoom(event.id)
        : undefined}
    />
  )
}
