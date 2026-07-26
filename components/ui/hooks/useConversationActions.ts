import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { UIMessage } from 'ai'
import { log } from '@/lib/debug'
import type { ConversationResponse, MessageData } from '@/lib/types'

type Room = { people: string[]; aiPresent: boolean }

export const apiMessageToUIMessage = (message: MessageData): UIMessage => ({
  id: message.id,
  role: message.role,
  parts: [{ type: 'text' as const, text: message.content }],
  metadata: { hydrated: true },
})

interface ConversationActionsInput {
  voyageSlugRef: MutableRefObject<string | null>
  setConversationId: Dispatch<SetStateAction<string | null>>
  setConversationTitle: Dispatch<SetStateAction<string | null>>
  setRoom: Dispatch<SetStateAction<Room>>
  setMessages: (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void
  setHasUserTyped: Dispatch<SetStateAction<boolean>>
}

export const useConversationActions = ({
  voyageSlugRef,
  setConversationId,
  setConversationTitle,
  setRoom,
  setMessages,
  setHasUserTyped,
}: ConversationActionsInput) => {
  const startNewConversation = async (): Promise<boolean> => {
    const voyageSlug = voyageSlugRef.current
    log.voyage('Starting new conversation', {
      voyageSlug: voyageSlug ?? 'personal',
    })
    try {
      const response = await fetch('/api/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voyageSlug ? { voyageSlug } : {}),
      })
      if (!response.ok) {
        log.voyage('Failed to start new conversation', {
          status: response.status,
        }, 'error')
        return false
      }
      const data: ConversationResponse = await response.json()
      setConversationId(data.conversation.id)
      setConversationTitle(data.conversation.title)
      setRoom(data.room ?? { people: [], aiPresent: true })
      setMessages([])
      setHasUserTyped(false)
      log.voyage('New conversation started', {
        conversationId: data.conversation.id,
      })
      return true
    } catch (error) {
      log.voyage('startNewConversation error', { error: String(error) }, 'error')
      return false
    }
  }

  const resumeConversation = async (
    targetConversationId: string,
  ): Promise<boolean> => {
    log.voyage('Resuming conversation via API', { targetConversationId })
    try {
      const response = await fetch('/api/conversation/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: targetConversationId }),
      })
      if (!response.ok) {
        log.voyage('Failed to resume conversation', {
          status: response.status,
        }, 'error')
        return false
      }
      const data: ConversationResponse = await response.json()
      setConversationId(data.conversation.id)
      setConversationTitle(data.conversation.title)
      setRoom(data.room ?? { people: [], aiPresent: true })
      setMessages(data.messages.map(apiMessageToUIMessage))
      setHasUserTyped(data.messages.length > 0)
      log.voyage('Conversation resumed', {
        conversationId: data.conversation.id,
      })
      return true
    } catch (error) {
      log.voyage('resumeConversation error', { error: String(error) }, 'error')
      return false
    }
  }

  return { startNewConversation, resumeConversation }
}
