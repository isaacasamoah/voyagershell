import { useRef, useEffect, useState, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { log } from '@/lib/debug'
import type { ConversationResponse, MessageData } from '@/lib/types'

// Convert API message to UIMessage format for useChat
const apiMessageToUIMessage = (msg: MessageData): UIMessage => ({
  id: msg.id,
  role: msg.role,
  parts: [{ type: 'text' as const, text: msg.content }],
})

interface UseConversationParams {
  currentVoyage: { slug: string; name: string } | null
  authState: string
  isAuthenticated: boolean
  isAuthLoading: boolean
}

export const useConversation = ({
  currentVoyage,
  authState,
  isAuthenticated,
  isAuthLoading,
}: UseConversationParams) => {
  // Conversation state
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversationTitle, setConversationTitle] = useState<string | null>(null)
  const [isLoadingConversation, setIsLoadingConversation] = useState(true)

  // Message queue - type while Voyager is thinking
  const [messageQueue, setMessageQueue] = useState<string[]>([])

  // Celebration state — drives singleton astronaut to 'celebrating' briefly
  const [showSuccess, setShowSuccess] = useState(false)

  // Hero → conversation mode tracking
  const [hasUserTyped, setHasUserTyped] = useState(false)
  const autoSentCount = useRef(0)

  // Side-channel for message timestamps (UIMessage type doesn't include createdAt)
  const messageTimestamps = useRef<Map<string, Date>>(new Map())

  // Refs for transport (read dynamically, avoid re-creating transport)
  const conversationIdRef = useRef<string | null>(null)
  conversationIdRef.current = conversationId
  const voyageSlugRef = useRef<string | null>(null)
  voyageSlugRef.current = currentVoyage?.slug ?? null
  const authStateRef = useRef(authState)
  authStateRef.current = authState

  // Create transport with dynamic body that reads current state via refs
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    body: () => ({
      conversationId: conversationIdRef.current,
      voyageSlug: voyageSlugRef.current,
      authState: authStateRef.current,
    }),
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
      setIsLoadingConversation(false)
      return
    }

    const fetchActiveConversation = async () => {
      try {
        const voyageSlug = currentVoyage?.slug
        const url = voyageSlug
          ? `/api/conversation?voyageSlug=${encodeURIComponent(voyageSlug)}`
          : '/api/conversation'
        const res = await fetch(url)
        if (!res.ok) throw new Error('Failed to fetch conversation')

        const data: ConversationResponse = await res.json()
        setConversationId(data.conversation.id)
        setConversationTitle(data.conversation.title)

        if (data.messages.length > 0) {
          const uiMessages = data.messages.map(apiMessageToUIMessage)
          // Store timestamps from DB for accurate display
          for (const msg of data.messages) {
            if (msg.createdAt) {
              messageTimestamps.current.set(msg.id, new Date(msg.createdAt))
            }
          }
          setMessages(uiMessages)
          setHasUserTyped(true)

          // Detect auto-sent welcome prompt to maintain correct message filtering
          const firstUserMsg = uiMessages.find((m: { role: string }) => m.role === 'user')
          if (firstUserMsg) {
            const text = firstUserMsg.parts
              ?.filter((p: { type: string }) => p.type === 'text')
              .map((p: { type: string; text?: string }) => p.text ?? '')
              .join('') ?? ''
            if (/^good (morning|afternoon|evening)/i.test(text)) {
              autoSentCount.current = 1
            }
          }
        } else {
          setMessages([])
        }

        log.voyage('Loaded conversation', { conversationId: data.conversation.id, voyageSlug: voyageSlug ?? 'personal' })
      } catch (error) {
        log.voyage('Failed to fetch conversation', { error: String(error) }, 'error')
      } finally {
        setIsLoadingConversation(false)
      }
    }

    fetchActiveConversation()
  }, [setMessages, isAuthenticated, isAuthLoading, currentVoyage?.slug])

  // Hidden welcome prompt — triggers Voyager's creative welcome without visible user message
  const hasTriggeredWelcomePrompt = useRef(false)
  useEffect(() => {
    if (isAuthLoading || isLoadingConversation) return
    if (hasTriggeredWelcomePrompt.current) return
    if (messages.length > 0) return

    hasTriggeredWelcomePrompt.current = true
    const hour = new Date().getHours()
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
    const voyageContext = currentVoyage ? ` in ${currentVoyage.name}` : ''

    const timer = setTimeout(() => {
      autoSentCount.current++
      sendMessage({ text: `good ${timeOfDay}${voyageContext}` })
    }, 300)
    return () => clearTimeout(timer)
  }, [isAuthLoading, isLoadingConversation, isAuthenticated, messages.length, sendMessage, currentVoyage])

  // Show success astronaut briefly when response completes + title sync
  useEffect(() => {
    const wasStreaming = prevStatusRef.current === 'streaming'
    const nowReady = status === 'ready'

    if (wasStreaming && nowReady && messages.length > 0) {
      // Celebration
      setShowSuccess(true)
      const timer = setTimeout(() => setShowSuccess(false), 2500)

      // Bug fix: $CTX title sync — fetch title after stream completes
      if (conversationTitle === null && messages.length >= 4) {
        const voyageSlug = currentVoyage?.slug
        const url = voyageSlug
          ? `/api/conversation?voyageSlug=${encodeURIComponent(voyageSlug)}`
          : '/api/conversation'
        fetch(url)
          .then(res => res.ok ? res.json() : null)
          .then((data: ConversationResponse | null) => {
            if (data?.conversation.title) {
              setConversationTitle(data.conversation.title)
            }
          })
          .catch(() => {})  // Silent — title sync is best-effort
      }

      prevStatusRef.current = status
      return () => clearTimeout(timer)
    }

    prevStatusRef.current = status
  }, [status, messages.length, conversationTitle, currentVoyage?.slug])

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

  return {
    conversationId,
    conversationTitle,
    isLoadingConversation,
    messages,
    sendMessage: gatedSendMessage,
    setMessages,
    status,
    error,
    hasUserTyped,
    setHasUserTyped,
    autoSentCount,
    messageTimestamps,
    messageQueue,
    setMessageQueue,
    isLoading,
    isStreaming,
    showSuccess,
    setShowSuccess,
  }
}
