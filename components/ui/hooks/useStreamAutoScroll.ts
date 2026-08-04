import { useEffect, useLayoutEffect, useRef } from 'react'
import type { MutableRefObject, RefObject } from 'react'

// How close to the bottom still counts as "following along". Further up than
// this is a deliberate read of history, and nothing may drag the user out of it.
const FOLLOW_THRESHOLD_PX = 64

interface StreamAutoScrollInput {
  streamRef: RefObject<HTMLDivElement>
  // Changes exactly once per message this client puts on screen for the user.
  // null until they have sent anything.
  ownSendKey: string | null
}

// The shell is server-rendered, where a layout effect is a no-op React warns
// about. Scroll position only exists in the browser anyway.
const useBrowserLayoutEffect = typeof window === 'undefined'
  ? useEffect
  : useLayoutEffect

// Never 'smooth': a smooth scroll animates in proportion to distance, so in a
// long conversation the user watches their own message crawl into view, and
// every new token restarts an animation whose target has already moved.
const jumpToBottom = (
  stream: HTMLDivElement,
  lastTop: MutableRefObject<number>,
) => {
  stream.scrollTo({ top: stream.scrollHeight, behavior: 'auto' })
  // Record where we actually landed (the browser clamps to the maximum) so the
  // scroll event this fires is recognisable as ours rather than a user drag.
  lastTop.current = stream.scrollTop
}

// Two rules, and only two:
//   1. The user's own send always lands them at the bottom, instantly and
//      unconditionally — they just acted, so put them where they acted.
//   2. Everything else (assistant tokens, feed events, the keyboard opening)
//      follows the bottom only while the user is already there.
export const useStreamAutoScroll = ({
  streamRef,
  ownSendKey,
}: StreamAutoScrollInput) => {
  const followingRef = useRef(true)
  const lastTopRef = useRef(0)

  // Only the user's own scrolling decides whether we keep following.
  useEffect(() => {
    const stream = streamRef.current
    if (!stream) return
    const measure = () => {
      const previousTop = lastTopRef.current
      lastTopRef.current = stream.scrollTop
      const fromBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight
      if (fromBottom <= FOLLOW_THRESHOLD_PX) {
        followingRef.current = true
        return
      }
      // Sitting far from the bottom is not itself a decision to leave it. A
      // scroll event is delivered a frame late, by which time streamed tokens
      // have already moved the bottom further away — treating that distance as
      // intent would quietly abandon the user mid-reply. Only a scroll that
      // actually travelled UP is the user stepping out.
      if (stream.scrollTop < previousTop) followingRef.current = false
    }
    stream.addEventListener('scroll', measure, { passive: true })
    return () => stream.removeEventListener('scroll', measure)
  }, [streamRef])

  // Content keeps growing after the render that introduced it — streamed
  // tokens, the composer collapsing, the keyboard resizing the shell. Reading
  // scrollHeight once in a render effect aims at a bottom that has already
  // moved; the element's own size is the signal that stays true for all of them.
  useEffect(() => {
    const stream = streamRef.current
    const content = stream?.firstElementChild
    if (!stream || !content) return
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (!followingRef.current) return
      jumpToBottom(stream, lastTopRef)
    })
    observer.observe(stream)
    observer.observe(content)
    return () => observer.disconnect()
  }, [streamRef])

  // The user just sent something: put them at the bottom before the browser
  // paints the new message, and resume following even if they had scrolled off.
  useBrowserLayoutEffect(() => {
    const stream = streamRef.current
    if (!stream || !ownSendKey) return
    followingRef.current = true
    jumpToBottom(stream, lastTopRef)
  }, [streamRef, ownSendKey])
}
