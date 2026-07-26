'use client'

import type { RefObject } from 'react'
import type { UIMessage } from 'ai'
import {
  AstronautState,
  TaskCard,
} from '@/components/chat'
import type {
  FeedEvent,
  StreamingReply,
} from '@/lib/messaging/feed-types'
import { VoyagerWordmark } from './VoyagerWordmark'
import { VoyagerFeedEvent } from './VoyagerFeedEvent'
import { VoyagerLiveTurn } from './VoyagerLiveTurn'
import type { RunningTask } from './voyager-types'

interface VoyagerStreamProps {
  streamRef: RefObject<HTMLDivElement>
  hasUserTyped: boolean
  composing: boolean
  astronautState: 'idle' | 'reading' | 'celebrating' | 'error'
  astronautBeat: number
  astronautSize: 'lg' | 'xl'
  progressLabel: string | null
  isStreaming: boolean
  feedEvents: FeedEvent[]
  markFeedSeen: (deliveryId: string) => void
  conversationId: string | null
  roomPeople: string[]
  shareToRoom: (sourceEventId: string) => Promise<void>
  messages: UIMessage[]
  streamingReply: StreamingReply | null
  ownVoyagerHandle: string
  ownVoyagerDisplayName: string | null
  sendMagicLink: (
    email: string,
  ) => Promise<{ success: boolean; error?: string }>
  sendUserMessage: (text: string) => void
  handleVoyageSwitch: (slug: string | null) => void
  startNewConversation: () => Promise<boolean>
  resumeConversation: (conversationId: string) => Promise<boolean>
  handleComponentAction: (action: string, data?: unknown) => void
  messageQueue: string[]
  error: Error | undefined
  runningTasks: RunningTask[]
}

export const VoyagerStream = (input: VoyagerStreamProps) => {
  const rawError = input.error?.message?.trim() ?? ''
  const errorText = rawError.startsWith('{')
    ? "that one didn't get through. try again?"
    : rawError || "that one didn't get through. try again?"
  return (
    <div
      ref={input.streamRef}
      className="flex-1 overflow-y-auto overscroll-contain"
    >
      <div className={`max-w-2xl mx-auto px-4 ${
        input.hasUserTyped
          ? 'py-8'
          : 'min-h-full flex flex-col justify-center'
      }`}>
        {(!input.hasUserTyped || !input.composing) && (
          <div className={`flex flex-col items-center pointer-events-none ${
            input.hasUserTyped ? 'mb-12' : ''
          }`}>
            {!input.hasUserTyped && (
              <VoyagerWordmark
                variant="hero"
                className="-mb-12 scale-[0.74] sm:-mb-32 sm:scale-90"
              />
            )}
            <div className={input.hasUserTyped
              ? 'scale-[0.5] sm:scale-75'
              : 'scale-[0.62] sm:scale-100'}>
              <AstronautState
                state={input.astronautState}
                beat={input.astronautBeat}
                size={input.astronautSize}
              />
            </div>
            {!input.hasUserTyped && (
              <p className="mt-1 sm:mt-5 text-center text-[11px] sm:text-xs tracking-[0.24em] sm:tracking-[0.5em] text-transparent bg-clip-text bg-gradient-to-r from-[#f7a34b] via-[#f4e04d] to-[#59a5ff] opacity-60">
                let&apos;s go together
              </p>
            )}
            {input.progressLabel && input.isStreaming && (
              <div className="text-center text-xs text-slate-500 mt-2 animate-pulse">
                {input.progressLabel}
              </div>
            )}
          </div>
        )}
        <div className="space-y-12">
          {input.feedEvents.map((event) => (
            <VoyagerFeedEvent
              key={event.id}
              event={event}
              conversationId={input.conversationId}
              roomPeople={input.roomPeople}
              markSeen={input.markFeedSeen}
              shareToRoom={input.shareToRoom}
            />
          ))}
          <VoyagerLiveTurn
            messages={input.messages}
            feedEvents={input.feedEvents}
            streamingReply={input.streamingReply}
            isStreaming={input.isStreaming}
            ownVoyagerHandle={input.ownVoyagerHandle}
            ownVoyagerDisplayName={input.ownVoyagerDisplayName}
            roomPeople={input.roomPeople}
            messageQueue={input.messageQueue}
            sendMagicLink={input.sendMagicLink}
            onSendMessage={input.sendUserMessage}
            onVoyageSwitch={input.handleVoyageSwitch}
            onNewConversation={input.startNewConversation}
            onResumeConversation={input.resumeConversation}
            onComponentAction={input.handleComponentAction}
          />
          {input.error && (
            <div className="flex gap-4">
              <div className="w-12 pt-1 text-right text-[#ff5f56]/60 text-[10px] font-bold tracking-widest">
                ERR
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[#ffb0aa] text-sm p-3 border border-[#ff5f56]/35 bg-[#ff5f56]/10 rounded-sm shadow-[0_0_18px_rgba(255,95,86,0.08)] break-words">
                  {errorText}
                </div>
              </div>
            </div>
          )}
          {input.runningTasks.length > 0 && (
            <div className="space-y-3 max-w-2xl mx-auto py-4">
              {input.runningTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  id={task.id}
                  objective={task.task}
                  progress={task.progress}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
