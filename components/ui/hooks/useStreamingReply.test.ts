// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useStreamingReply } from './useStreamingReply'

describe('useStreamingReply', () => {
  it('does not mirror retrieval-heavy streamed content into local state', () => {
    const { result, rerender } = renderHook(
      ({ streamedContent }: { streamedContent: string }) => {
        // Content is deliberately consumed only to derive the one-way
        // renderability transition. It is not passed into the state hook.
        return useStreamingReply({
          assistantId: 'assistant-1',
          hasRenderableOutput: streamedContent.length > 0,
          isStreaming: true,
          assistantEventCount: 4,
          conversationId: 'conversation-1',
        })
      },
      { initialProps: { streamedContent: 'Searching memory…' } },
    )

    const turnMetadata = result.current
    expect(turnMetadata).toEqual({ id: 'assistant-1', settledCount: 4 })
    expect(turnMetadata).not.toHaveProperty('content')

    // A dense SDK stream can publish hundreds of content snapshots for one
    // assistant id. None may create another local state transition.
    for (let chunk = 0; chunk < 200; chunk += 1) {
      rerender({ streamedContent: `Searching memory… chunk ${chunk}` })
      expect(result.current).toBe(turnMetadata)
    }
  })

  it('settles once the turn adds an assistant event to the feed', () => {
    const { result, rerender } = renderHook(
      ({ assistantEventCount }: { assistantEventCount: number }) => useStreamingReply({
        assistantId: 'assistant-1',
        hasRenderableOutput: true,
        isStreaming: true,
        assistantEventCount,
        conversationId: 'conversation-1',
      }),
      { initialProps: { assistantEventCount: 4 } },
    )

    expect(result.current?.settledCount).toBe(4)
    rerender({ assistantEventCount: 5 })
    expect(result.current).toBeNull()
  })
})
