import { useCallback } from 'react'
import type {
  Dispatch,
  FormEvent,
  SetStateAction,
} from 'react'
import type { UIMessage } from 'ai'

interface VoyagerActionsInput {
  inputValue: string
  setInputValue: Dispatch<SetStateAction<string>>
  isAuthenticated: boolean
  conversationId: string | null
  isLoading: boolean
  setHasUserTyped: Dispatch<SetStateAction<boolean>>
  setMessages: (
    messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])
  ) => void
  setMessageQueue: Dispatch<SetStateAction<string[]>>
  sendMessage: (message: { text: string }) => void
  reloadFeed: () => Promise<void>
}

export const useVoyagerActions = (input: VoyagerActionsInput) => {
  const {
    inputValue,
    setInputValue,
    isAuthenticated,
    conversationId,
    isLoading,
    setHasUserTyped,
    setMessages,
    setMessageQueue,
    sendMessage,
    reloadFeed,
  } = input
  const sendUserMessage = useCallback((text: string) => {
    setHasUserTyped(true)
    if (isLoading) {
      setMessageQueue((previous) => [...previous, text])
    } else {
      sendMessage({ text })
    }
  }, [
    isLoading,
    sendMessage,
    setHasUserTyped,
    setMessageQueue,
  ])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = inputValue.trim()
    if (!text) return
    setHasUserTyped(true)
    if (!isAuthenticated) {
      setMessages((previous) => [...previous, {
        id: `preview-auth-${Date.now()}`,
        role: 'assistant',
        parts: [{
          type: 'text',
          text: 'sign in to send live messages from VoyagerShell.',
        }],
      } as UIMessage])
    } else if (isLoading) {
      setMessageQueue((previous) => [...previous, text])
    } else {
      sendMessage({ text })
    }
    setInputValue('')
  }

  const shareToRoom = useCallback(async (sourceEventId: string) => {
    if (!conversationId) throw new Error('No active room')
    const response = await fetch('/api/messages/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceEventId,
        conversationId,
      }),
    })
    if (!response.ok) throw new Error('Share failed')
    await reloadFeed()
  }, [conversationId, reloadFeed])

  const handleComponentAction = useCallback((
    action: string,
    data?: unknown,
  ) => {
    if (
      action === 'voyage_select'
      && typeof data === 'string'
      && conversationId
      && !isLoading
    ) sendMessage({ text: `switch to ${data}` })
  }, [conversationId, isLoading, sendMessage])

  return {
    handleSubmit,
    sendUserMessage,
    shareToRoom,
    handleComponentAction,
  }
}
