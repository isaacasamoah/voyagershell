import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { log } from '@/lib/debug'
import type { ConversationResponse, MessageData } from '@/lib/types'

// Convert API message to UIMessage format for useChat
// Messages restored from the stream are settled history — they must NEVER
// enter the optimistic LIVE lane (that lane is only for text typed in THIS
// client since load). Without this flag, another person's message (or their
// Voyager's reply, role-flattened to 'user' for the model) renders as "YOU".
const apiMessageToUIMessage = (msg: MessageData): UIMessage => ({
  id: msg.id,
  role: msg.role,
  parts: [{ type: 'text' as const, text: msg.content }],
  metadata: { hydrated: true },
})

interface UseConversationParams {
  currentVoyage: { slug: string; name: string } | null
  voyageResolved: boolean
  authState: string
  isAuthenticated: boolean
  isAuthLoading: boolean
}

export const useConversation = ({
  currentVoyage,
  voyageResolved,
  authState,
  isAuthenticated,
  isAuthLoading,
}: UseConversationParams) => {
  // Conversation state
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [room, setRoom] = useState<{ people: string[]; aiPresent: boolean }>({ people: [], aiPresent: true })
  const [conversationTitle, setConversationTitle] = useState<string | null>(null)
  const [isLoadingConversation, setIsLoadingConversation] = useState(true)

  // Message queue - type while Voyager is thinking
  const [messageQueue, setMessageQueue] = useState<string[]>([])

  // Celebration state — drives singleton astronaut to 'celebrating' briefly
  const [showSuccess, setShowSuccess] = useState(false)

  // Hero → conversation mode tracking
  const [hasUserTyped, setHasUserTyped] = useState(false)
  // Set true right before the hidden welcome send; consumed (reset) by the
  // transport body so the route knows NOT to persist that synthetic turn.
  const autoSentRef = useRef(false)

  // Side-channel for message timestamps (UIMessage type doesn't include createdAt)

  // Refs for transport (read dynamically, avoid re-creating transport)
  const conversationIdRef = useRef<string | null>(null)
  conversationIdRef.current = conversationId
  const voyageSlugRef = useRef<string | null>(null)
  voyageSlugRef.current = currentVoyage?.slug ?? null
  const authStateRef = useRef(authState)
  authStateRef.current = authState

  // Messaging v2 — the chat body carries only the session id. Voyage is
  // derived server-side from the session, so there's no voyageSlug channel to
  // drift out of sync with the conversation.
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    body: () => {
      const autoSent = autoSentRef.current
      autoSentRef.current = false // consume: true for exactly the next request
      return {
        conversationId: conversationIdRef.current,
        authState: authStateRef.current,
        autoSent,
      }
    },
  }), [])

  // useChat with transport
  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport,
  })

  // Derived state
  const isLoading = status === 'submitted' || status === 'streaming'
  const isStreaming = status === 'streaming'
  const prevStatusRef = useRef(status)

  // Auto-continue: fetch active conversation on mount and when voyage changes
  useEffect(() => {
    if (isAuthLoading) return
    if (!isAuthenticated) {
      setConversationId(null)
      setConversationTitle(null)
      setRoom({ people: [], aiPresent: true })
      setIsLoadingConversation(false)
      return
    }
    // Wait for the initial voyage resolution before the first load, so a
    // no-voyage fetch can't race ahead and stick on personal before resume
    // resolves. Once resolved (or a voyage is already set), proceed.
    if (!voyageResolved && !currentVoyage) {
      setIsLoadingConversation(true)
      return
    }

    let cancelled = false
    setIsLoadingConversation(true)
    setConversationId(null)
    setConversationTitle(null)

    const fetchActiveConversation = async () => {
      try {
        const voyageSlug = currentVoyage?.slug
        const url = voyageSlug
          ? `/api/conversation?voyageSlug=${encodeURIComponent(voyageSlug)}`
          : '/api/conversation'
        const res = await fetch(url)
        if (!res.ok) throw new Error('Failed to fetch conversation')

        const data: ConversationResponse = await res.json()
        if (cancelled) return

        setConversationId(data.conversation.id)
        setConversationTitle(data.conversation.title)
        setRoom(data.room ?? { people: [], aiPresent: true })

        if (data.messages.length > 0) {
          const uiMessages = data.messages.map(apiMessageToUIMessage)
          setMessages(uiMessages)
          setHasUserTyped(true)
        } else {
          setMessages([])
        }

        log.voyage('Loaded conversation', { conversationId: data.conversation.id, voyageSlug: voyageSlug ?? 'personal' })
      } catch (error) {
        if (!cancelled) log.voyage('Failed to fetch conversation', { error: String(error) }, 'error')
      } finally {
        if (!cancelled) setIsLoadingConversation(false)
      }
    }

    fetchActiveConversation()
    return () => {
      cancelled = true
    }
  }, [setMessages, isAuthenticated, isAuthLoading, currentVoyage?.slug, voyageResolved])

  // Hidden welcome prompt — triggers Voyager's creative welcome without visible user message
  const hasTriggeredWelcomePrompt = useRef(false)
  useEffect(() => {
    if (isAuthLoading || isLoadingConversation) return
    if (!isAuthenticated) return
    if (hasTriggeredWelcomePrompt.current) return
    if (messages.length > 0) return

    hasTriggeredWelcomePrompt.current = true
    const hour = new Date().getHours()
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
    const voyageContext = currentVoyage ? ` in ${currentVoyage.name}` : ''

    const timer = setTimeout(() => {
      autoSentRef.current = true
      sendMessage({ text: `good ${timeOfDay}${voyageContext}` })
    }, 300)
    return () => clearTimeout(timer)
  }, [isAuthLoading, isLoadingConversation, isAuthenticated, messages.length, sendMessage, currentVoyage])

  // $CTX = server-confirmed DB title only — never echo user input
  // null until the server confirms a title (new session shows 'NEW_SESSION' placeholder in the chip)
  const resolvedTitle = conversationTitle ?? null

  const refreshRoom = useCallback(async (): Promise<void> => {
    const targetConversationId = conversationIdRef.current
    if (!targetConversationId) {
      setRoom({ people: [], aiPresent: true })
      return
    }

    try {
      const response = await fetch(`/api/room?conversationId=${encodeURIComponent(targetConversationId)}`, {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(`Room refresh failed (${response.status})`)
      const data = await response.json() as { room: { people: string[]; aiPresent: boolean } }
      // Ignore a late response after the user has switched conversations.
      if (conversationIdRef.current === targetConversationId) setRoom(data.room)
    } catch (error) {
      log.voyage('Failed to refresh room state', { error: String(error) }, 'error')
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated || !conversationId) return
    void refreshRoom()
  }, [conversationId, isAuthenticated, refreshRoom])

  // Show success astronaut briefly when response completes
  useEffect(() => {
    const wasStreaming = prevStatusRef.current === 'streaming'
    const nowReady = status === 'ready'

    if (wasStreaming && nowReady && messages.length > 0) {
      setShowSuccess(true)
      const timer = setTimeout(() => setShowSuccess(false), 2500)

      prevStatusRef.current = status
      return () => clearTimeout(timer)
    }

    prevStatusRef.current = status
  }, [status, messages.length])

  // Process queued messages when Voyager finishes responding
  useEffect(() => {
    if (!isLoading && messageQueue.length > 0 && conversationId) {
      const nextMessage = messageQueue[0]
      setMessageQueue(prev => prev.slice(1))
      setTimeout(() => {
        sendMessage({ text: nextMessage })
      }, 100)
    }
  }, [isLoading, messageQueue, conversationId, sendMessage])

  // Gated sendMessage — prevents sending before conversation load completes (F6: context guarantee)
  const gatedSendMessage = useMemo(() => {
    return (params: { text: string }) => {
      if (isLoadingConversation) {
        setMessageQueue(prev => [...prev, params.text])
        return
      }
      sendMessage(params)
    }
  }, [isLoadingConversation, sendMessage])

  // Start new conversation — calls POST /api/conversation, archives current, resets UI state
  const startNewConversation = useCallback(async (): Promise<boolean> => {
    const voyageSlug = voyageSlugRef.current
    log.voyage('Starting new conversation', { voyageSlug: voyageSlug ?? 'personal' })

    try {
      const res = await fetch('/api/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voyageSlug ? { voyageSlug } : {}),
      })

      if (!res.ok) {
        log.voyage('Failed to start new conversation', { status: res.status }, 'error')
        return false
      }

      const data: ConversationResponse = await res.json()
      setConversationId(data.conversation.id)
      setConversationTitle(data.conversation.title)
      setRoom(data.room ?? { people: [], aiPresent: true })
      setMessages([])
      setHasUserTyped(false)

      log.voyage('New conversation started', { conversationId: data.conversation.id })
      return true
    } catch (error) {
      log.voyage('startNewConversation error', { error: String(error) }, 'error')
      return false
    }
  }, [setMessages, setHasUserTyped])

  // Resume an existing conversation — calls POST /api/conversation/resume, reloads UI state
  const resumeConversation = useCallback(async (targetConversationId: string): Promise<boolean> => {
    log.voyage('Resuming conversation via API', { targetConversationId })

    try {
      const res = await fetch('/api/conversation/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: targetConversationId }),
      })

      if (!res.ok) {
        log.voyage('Failed to resume conversation', { status: res.status }, 'error')
        return false
      }

      const data: ConversationResponse = await res.json()
      setConversationId(data.conversation.id)
      setConversationTitle(data.conversation.title)
      setRoom(data.room ?? { people: [], aiPresent: true })

      if (data.messages.length > 0) {
        setMessages(data.messages.map(apiMessageToUIMessage))
        setHasUserTyped(true)
      } else {
        setMessages([])
        setHasUserTyped(false)
      }

      log.voyage('Conversation resumed', { conversationId: data.conversation.id })
      return true
    } catch (error) {
      log.voyage('resumeConversation error', { error: String(error) }, 'error')
      return false
    }
  }, [setMessages, setHasUserTyped])

  return {
    conversationId,
    room,
    conversationTitle: resolvedTitle,
    isLoadingConversation,
    messages,
    sendMessage: gatedSendMessage,
    setMessages,
    status,
    error,
    hasUserTyped,
    setHasUserTyped,
    messageQueue,
    setMessageQueue,
    isLoading,
    isStreaming,
    showSuccess,
    setShowSuccess,
    refreshRoom,
    startNewConversation,
    resumeConversation,
  }
}
