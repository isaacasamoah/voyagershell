// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import type { UIMessage } from 'ai'
import { describe, expect, it, vi } from 'vitest'
import { useLiveConversation } from './useLiveConversation'

// Same stand-in geometry as useStreamAutoScroll's own tests: jsdom cannot lay
// out or scroll, so the element the hook writes to is owned by the test.
const createStream = () => {
  const stream = {
    scrollTop: 0,
    scrollHeight: 2000,
    clientHeight: 500,
    firstElementChild: {} as Element,
    scrollTo: vi.fn(),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  return {
    stream,
    streamRef: { current: stream as unknown as HTMLDivElement },
  }
}

const userMessage = (id: string, text: string): UIMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
}) as UIMessage

const restoredMessage = (id: string, text: string): UIMessage => ({
  ...userMessage(id, text),
  metadata: { hydrated: true },
}) as UIMessage

const renderLive = (
  streamRef: { current: HTMLDivElement },
  initialProps: { messages: UIMessage[]; queuedCount: number },
) => renderHook(
  ({ messages, queuedCount }: { messages: UIMessage[]; queuedCount: number }) => (
    useLiveConversation({
      messages,
      feedEvents: [],
      isStreaming: false,
      conversationId: 'conversation-1',
      streamRef,
      queuedCount,
    })
  ),
  { initialProps },
)

describe('useLiveConversation', () => {
  it('moves the viewport on the send itself, with no feed round-trip', () => {
    const { stream, streamRef } = createStream()
    const { rerender } = renderLive(streamRef, {
      messages: [],
      queuedCount: 0,
    })

    stream.scrollTo.mockClear()
    // Exactly what pressing enter does: the SDK appends the user's message.
    // No feed event has landed and no reply has started streaming yet.
    rerender({ messages: [userMessage('message-1', 'hello')], queuedCount: 0 })

    expect(stream.scrollTo).toHaveBeenCalledWith({
      top: 2000,
      behavior: 'auto',
    })
  })

  it('counts a message queued behind a running reply as the user acting', () => {
    const { stream, streamRef } = createStream()
    const { rerender } = renderLive(streamRef, {
      messages: [userMessage('message-1', 'hello')],
      queuedCount: 0,
    })

    stream.scrollTo.mockClear()
    rerender({
      messages: [userMessage('message-1', 'hello')],
      queuedCount: 1,
    })

    expect(stream.scrollTo).toHaveBeenCalledWith({
      top: 2000,
      behavior: 'auto',
    })
  })

  it('does not treat restored history as something the user just did', () => {
    const { stream, streamRef } = createStream()
    const { rerender } = renderLive(streamRef, {
      messages: [],
      queuedCount: 0,
    })

    stream.scrollTo.mockClear()
    rerender({
      messages: [restoredMessage('message-1', 'from last session')],
      queuedCount: 0,
    })

    expect(stream.scrollTo).not.toHaveBeenCalled()
  })
})
