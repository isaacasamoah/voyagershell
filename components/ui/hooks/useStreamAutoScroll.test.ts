// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import { useEffect } from 'react'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { useStreamAutoScroll } from './useStreamAutoScroll'

// jsdom has no layout: a real div reports scrollHeight 0 and never scrolls, so
// the only honest way to observe this hook's decisions is a stand-in element
// whose geometry the test owns outright.
const createStream = () => {
  const scrollListeners = new Set<() => void>()
  const stream = {
    scrollTop: 0,
    scrollHeight: 2000,
    clientHeight: 500,
    firstElementChild: {} as Element,
    scrollTo: vi.fn((options: ScrollToOptions) => {
      // Browsers clamp to the last scrollable pixel, and the hook reads the
      // landing position back, so the stand-in has to clamp too.
      const bottom = stream.scrollHeight - stream.clientHeight
      stream.scrollTop = Math.min(options.top ?? 0, bottom)
    }),
    addEventListener: (_type: string, listener: () => void) => {
      scrollListeners.add(listener)
    },
    removeEventListener: (_type: string, listener: () => void) => {
      scrollListeners.delete(listener)
    },
  }
  // A scroll event is delivered a frame after the position moved, so the test
  // dispatches it separately from the move that caused it.
  const fireScroll = () => {
    scrollListeners.forEach((listener) => listener())
  }
  return {
    stream,
    streamRef: { current: stream as unknown as HTMLDivElement },
    fireScroll,
    userScrollsTo: (top: number) => {
      stream.scrollTop = top
      fireScroll()
    },
    scrollListenerCount: () => scrollListeners.size,
    bottom: () => stream.scrollHeight - stream.clientHeight,
  }
}

interface OwnSendProps {
  ownSendKey: string | null
}

const beforeAnySend: OwnSendProps = { ownSendKey: null }

const resizeCallbacks = new Set<() => void>()

class FakeResizeObserver {
  private readonly notify: () => void

  constructor(callback: ResizeObserverCallback) {
    this.notify = () => callback([], this as unknown as ResizeObserver)
    resizeCallbacks.add(this.notify)
  }

  observe() {}

  unobserve() {}

  disconnect() {
    resizeCallbacks.delete(this.notify)
  }
}

const contentGrows = () => {
  resizeCallbacks.forEach((notify) => notify())
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
  resizeCallbacks.clear()
})

describe('useStreamAutoScroll', () => {
  it('puts the user at the bottom of their own send before the frame paints', () => {
    const { stream, streamRef, bottom } = createStream()
    const order: string[] = []
    const clamp = stream.scrollTo.getMockImplementation()
    stream.scrollTo.mockImplementation((options: ScrollToOptions) => {
      clamp?.(options)
      order.push(`scroll:${options.behavior}`)
    })

    const { rerender } = renderHook(
      ({ ownSendKey }: OwnSendProps) => {
        useStreamAutoScroll({ streamRef, ownSendKey })
        // A passive effect is deferred until after the browser has painted.
        // Anything recorded before it ran in the layout phase, i.e. the user
        // never sees a frame with their message below the fold.
        useEffect(() => {
          order.push('painted')
        })
      },
      { initialProps: beforeAnySend },
    )

    order.length = 0
    rerender({ ownSendKey: 'message-1:0' })

    expect(order).toEqual(['scroll:auto', 'painted'])
    expect(stream.scrollTop).toBe(bottom())
  })

  it('reads the bottom as content grows, not once when the send landed', () => {
    const { stream, streamRef } = createStream()
    renderHook(() => useStreamAutoScroll({
      streamRef,
      ownSendKey: 'message-1:0',
    }))

    stream.scrollTo.mockClear()
    stream.scrollHeight = 2400 // the reply streams in under the user's message
    contentGrows()

    expect(stream.scrollTo).toHaveBeenCalledWith({
      top: 2400,
      behavior: 'auto',
    })
  })

  it('leaves a user who scrolled up alone while the assistant streams', () => {
    const { stream, streamRef, userScrollsTo } = createStream()
    renderHook(() => useStreamAutoScroll({
      streamRef,
      ownSendKey: 'message-1:0',
    }))

    stream.scrollTo.mockClear()
    userScrollsTo(200) // 1300px above the bottom — reading history
    stream.scrollHeight = 2400
    contentGrows()

    expect(stream.scrollTo).not.toHaveBeenCalled()
    expect(stream.scrollTop).toBe(200)
  })

  it('keeps following for a user who stayed at the bottom', () => {
    const { stream, streamRef, userScrollsTo } = createStream()
    renderHook(() => useStreamAutoScroll({
      streamRef,
      ownSendKey: 'message-1:0',
    }))

    stream.scrollTo.mockClear()
    userScrollsTo(1460) // 40px above the bottom — still following along
    stream.scrollHeight = 2400
    contentGrows()

    expect(stream.scrollTo).toHaveBeenCalledWith({
      top: 2400,
      behavior: 'auto',
    })
  })

  it('does not mistake a late follow-scroll event for the user leaving', () => {
    const { stream, streamRef, fireScroll } = createStream()
    renderHook(() => useStreamAutoScroll({
      streamRef,
      ownSendKey: 'message-1:0',
    }))

    stream.scrollHeight = 2400
    contentGrows() // the follow lands at the bottom of 2400
    stream.scrollHeight = 2600 // more tokens arrive before the event dispatches
    fireScroll() // 200px from the bottom now, yet nobody scrolled anywhere

    stream.scrollTo.mockClear()
    stream.scrollHeight = 2800
    contentGrows()

    expect(stream.scrollTo).toHaveBeenCalledWith({
      top: 2800,
      behavior: 'auto',
    })
  })

  it('still honours a send from a user who had scrolled away, and refollows', () => {
    const { stream, streamRef, userScrollsTo } = createStream()
    const { rerender } = renderHook(
      ({ ownSendKey }: OwnSendProps) => useStreamAutoScroll({
        streamRef,
        ownSendKey,
      }),
      { initialProps: { ownSendKey: 'message-1:0' } as OwnSendProps },
    )

    stream.scrollTo.mockClear()
    userScrollsTo(200)
    rerender({ ownSendKey: 'message-2:0' })

    expect(stream.scrollTo).toHaveBeenCalledWith({
      top: 2000,
      behavior: 'auto',
    })

    stream.scrollHeight = 2600
    contentGrows()

    expect(stream.scrollTo).toHaveBeenLastCalledWith({
      top: 2600,
      behavior: 'auto',
    })
  })

  it('releases its listeners on unmount', () => {
    const { streamRef, scrollListenerCount } = createStream()
    const { unmount } = renderHook(() => useStreamAutoScroll({
      streamRef,
      ownSendKey: null,
    }))

    expect(scrollListenerCount()).toBe(1)
    expect(resizeCallbacks.size).toBe(1)

    unmount()

    expect(scrollListenerCount()).toBe(0)
    expect(resizeCallbacks.size).toBe(0)
  })
})
