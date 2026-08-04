'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from '@/lib/auth/context'
import {
  composerAsideBadge,
  resolveComposerAudience,
} from '@/lib/messaging/address'
import { useEventFeed } from '@/lib/messaging/useEventFeed'
import {
  getSuggestions,
  getWelcomeSuggestion,
  type SuggestionContext,
} from '@/lib/ui/suggestions'
import { useAstronautState } from './hooks/useAstronautState'
import { useBrainConnection } from './hooks/useBrainConnection'
import { useConversation } from './hooks/useConversation'
import { useLiveConversation } from './hooks/useLiveConversation'
import { useRoomMembershipRealtime } from './hooks/useRoomMembershipRealtime'
import { useRunningTasks } from './hooks/useRunningTasks'
import { useVisualViewport } from './hooks/useVisualViewport'
import { useVoyagerToolEffects } from './hooks/useVoyagerToolEffects'
import { useVoyagerActions } from './hooks/useVoyagerActions'
import { useVoyageContext } from './hooks/useVoyageContext'
import { VoyagerComposer } from './VoyagerComposer'
import { VoyagerHeader } from './VoyagerHeader'
import { VoyagerStream } from './VoyagerStream'

interface VoyagerInterfaceProps {
  className?: string
}

export const VoyagerInterface = ({ className }: VoyagerInterfaceProps) => {
  const streamRef = useRef<HTMLDivElement>(null)
  const [inputValue, setInputValue] = useState('')
  const [authState, setAuthState] = useState<
    'unauthenticated' | 'authenticated' | 'just-authenticated'
  >('unauthenticated')
  const {
    isAuthenticated,
    isLoading: isAuthLoading,
    sendMagicLink,
    signOut,
    user,
  } = useAuth()
  const hasBrain = useBrainConnection(isAuthenticated)
  const { height: shellHeight, offsetTop: shellTop, composing } =
    useVisualViewport()
  const voyage = useVoyageContext({ isAuthenticated, isAuthLoading })
  const conversation = useConversation({
    currentVoyage: voyage.currentVoyage,
    voyageResolved: voyage.voyageResolved,
    authState,
    isAuthenticated,
    isAuthLoading,
  })
  const setHasUserTyped = conversation.setHasUserTyped
  const setShowSuccess = conversation.setShowSuccess
  const composerAudience = useMemo(() => resolveComposerAudience(
    inputValue,
    {
      ownVoyagerHandle: voyage.ownVoyagerHandle,
      ownVoyagerAliases: ['voyager'],
    },
    conversation.room.people,
  ), [inputValue, voyage.ownVoyagerHandle, conversation.room.people])
  const composerAsideCue = useMemo(() => composerAsideBadge(
    inputValue,
    {
      ownVoyagerHandle: voyage.ownVoyagerHandle,
      ownVoyagerAliases: ['voyager'],
    },
  ), [inputValue, voyage.ownVoyagerHandle])
  const feedUserId = isAuthenticated ? (user?.id ?? null) : null
  useRoomMembershipRealtime({
    conversationId: conversation.conversationId,
    userId: feedUserId,
    refreshRoom: conversation.refreshRoom,
  })
  const {
    events: feedEvents,
    markSeen: markFeedSeen,
    reload: reloadFeed,
  } = useEventFeed({
    conversationId: conversation.conversationId,
    userId: feedUserId,
  })
  useEffect(() => {
    if (feedEvents.length > 0) setHasUserTyped(true)
  }, [feedEvents.length, setHasUserTyped])
  const astronaut = useAstronautState({
    messages: conversation.messages,
    status: conversation.status,
    error: conversation.error,
    showSuccess: conversation.showSuccess,
    isLoading: conversation.isLoading,
    isAuthLoading,
    isLoadingConversation: conversation.isLoadingConversation,
    hasUserTyped: conversation.hasUserTyped,
  })
  const runningTasks = useRunningTasks(
    conversation.conversationId,
    isAuthenticated,
  )
  const wasAuthenticatedRef = useRef(isAuthenticated)
  useEffect(() => {
    if (isAuthLoading) return
    if (isAuthenticated && !wasAuthenticatedRef.current) {
      setAuthState('just-authenticated')
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 2000)
      setTimeout(() => setAuthState('authenticated'), 3000)
    } else {
      setAuthState(isAuthenticated ? 'authenticated' : 'unauthenticated')
    }
    wasAuthenticatedRef.current = isAuthenticated
  }, [
    isAuthenticated,
    isAuthLoading,
    setShowSuccess,
  ])
  const setCurrentVoyage = voyage.setCurrentVoyage
  const voyages = voyage.voyages
  const handleVoyageSwitch = useCallback((slug: string | null) => {
    if (slug === null) {
      setCurrentVoyage(null)
      window.history.replaceState({}, '', window.location.pathname)
      return
    }
    const target = voyages.find((item) => item.slug === slug)
    if (!target) return
    setCurrentVoyage(target)
    window.history.replaceState({}, '', `?voyage=${slug}`)
  }, [voyages, setCurrentVoyage])
  useVoyagerToolEffects({
    status: conversation.status,
    messages: conversation.messages,
    signOut,
    handleVoyageSwitch,
    refetchVoyages: voyage.refetchVoyages,
    refetchOwnVoyagerIdentity: voyage.refetchOwnVoyagerIdentity,
    reloadFeed,
  })
  const {
    handleSubmit,
    sendUserMessage,
    shareToRoom,
    handleComponentAction,
  } = useVoyagerActions({
    inputValue,
    setInputValue,
    isAuthenticated,
    conversationId: conversation.conversationId,
    isLoading: conversation.isLoading,
    setHasUserTyped: conversation.setHasUserTyped,
    setMessages: conversation.setMessages,
    setMessageQueue: conversation.setMessageQueue,
    sendMessage: conversation.sendMessage,
    reloadFeed,
  })
  const suggestionContext: SuggestionContext = {
    isAuthenticated,
    hasVoyages: voyage.voyages.length > 0,
    currentVoyage: voyage.currentVoyage?.slug,
    hasRecentConversations: false,
    lastMessageRole: conversation.messages.at(-1)?.role,
    conversationLength: conversation.messages.length,
    isLoading: conversation.isLoading,
  }
  const streamingReply = useLiveConversation({
    messages: conversation.messages,
    feedEvents,
    isStreaming: conversation.isStreaming,
    conversationId: conversation.conversationId,
    streamRef,
    queuedCount: conversation.messageQueue.length,
  })
  return (
    <div
      className={`fixed top-0 left-0 right-0 h-[100svh] flex flex-col overflow-hidden bg-[#050505] text-slate-300 font-mono text-sm selection:bg-indigo-500/30 ${className || ''}`}
      style={{
        height: shellHeight ? `${shellHeight}px` : undefined,
        top: shellTop ? `${shellTop}px` : undefined,
      }}
    >
      <VoyagerHeader
        visible={conversation.hasUserTyped}
        isAuthenticated={isAuthenticated}
        currentVoyage={voyage.currentVoyage}
        conversationTitle={conversation.conversationTitle}
        room={conversation.room}
        displayName={voyage.displayName}
      />
      <VoyagerStream
        streamRef={streamRef}
        hasUserTyped={conversation.hasUserTyped}
        composing={composing}
        {...astronaut}
        isStreaming={conversation.isStreaming}
        feedEvents={feedEvents}
        markFeedSeen={markFeedSeen}
        conversationId={conversation.conversationId}
        roomPeople={conversation.room.people}
        shareToRoom={shareToRoom}
        messages={conversation.messages}
        streamingReply={streamingReply}
        ownVoyagerHandle={voyage.ownVoyagerHandle}
        ownVoyagerDisplayName={voyage.ownVoyagerDisplayName}
        sendMagicLink={sendMagicLink}
        sendUserMessage={sendUserMessage}
        handleVoyageSwitch={handleVoyageSwitch}
        startNewConversation={conversation.startNewConversation}
        resumeConversation={conversation.resumeConversation}
        handleComponentAction={handleComponentAction}
        messageQueue={conversation.messageQueue}
        error={conversation.error}
        runningTasks={runningTasks}
      />
      <VoyagerComposer
        isAuthenticated={isAuthenticated}
        hasBrain={hasBrain}
        suggestions={getSuggestions(suggestionContext)}
        welcomeHint={getWelcomeSuggestion(suggestionContext)}
        messageCount={conversation.messages.length}
        composerAudience={composerAudience}
        composerAsideCue={composerAsideCue}
        inputValue={inputValue}
        isLoading={conversation.isLoading}
        queueCount={conversation.messageQueue.length}
        onInputChange={setInputValue}
        onSuggestion={setInputValue}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
