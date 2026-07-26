import { useEffect, useRef, useState } from 'react'
import {
  advanceStreamingReply,
  settleStreamingReply,
  type StreamingReply,
} from '@/lib/messaging/feed-types'

interface UseStreamingReplyParams {
  assistantId: string | null
  hasRenderableOutput: boolean
  isStreaming: boolean
  assistantEventCount: number
  conversationId: string | null
}

// The AI SDK owns live content. This hook owns only the stable identity and
// feed-reconciliation baseline for the current assistant turn. In particular,
// streamed text is not an input: mirroring every token through a passive
// setState effect creates a second render per chunk and can exceed React's
// passive update-depth limit during retrieval-heavy bursts.
export const useStreamingReply = ({
  assistantId,
  hasRenderableOutput,
  isStreaming,
  assistantEventCount,
  conversationId,
}: UseStreamingReplyParams): StreamingReply | null => {
  const [reply, setReply] = useState<StreamingReply | null>(null)
  const assistantEventCountRef = useRef(assistantEventCount)

  // Reset first so a simultaneous conversation change + first assistant
  // output can still establish the new turn in the later transition effect.
  useEffect(() => {
    setReply(null)
  }, [conversationId])

  useEffect(() => {
    assistantEventCountRef.current = assistantEventCount
  }, [assistantEventCount])

  useEffect(() => {
    setReply((previous) => advanceStreamingReply(previous, {
      assistantId,
      hasRenderableOutput,
      isStreaming,
      assistantEventCount: assistantEventCountRef.current,
    }))
  }, [assistantId, hasRenderableOutput, isStreaming])

  useEffect(() => {
    setReply((previous) => settleStreamingReply(previous, assistantEventCount))
  }, [assistantEventCount])

  return reply
}
