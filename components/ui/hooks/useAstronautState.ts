import { useMemo } from 'react'
import type { UIMessage } from 'ai'

interface UseAstronautStateParams {
  messages: UIMessage[]
  status: string
  error: Error | undefined
  showSuccess: boolean
  isLoading: boolean
  isAuthLoading: boolean
  isLoadingConversation: boolean
  hasUserTyped: boolean
}

export const useAstronautState = ({
  messages,
  status,
  error,
  showSuccess,
  isLoading,
  isAuthLoading,
  isLoadingConversation,
  hasUserTyped,
}: UseAstronautStateParams) => {
  const isStreaming = status === 'streaming'

  // Compute step depth and tool info from current streaming message
  const { stepDepth, lastToolName, hasBackgroundSpawn } = useMemo(() => {
    if (!isStreaming || messages.length === 0) return { stepDepth: 0, lastToolName: null as string | null, hasBackgroundSpawn: false }
    const lastMessage = messages[messages.length - 1]
    if (lastMessage.role !== 'assistant' || !Array.isArray(lastMessage.parts)) {
      return { stepDepth: 0, lastToolName: null as string | null, hasBackgroundSpawn: false }
    }
    let depth = 0
    let toolName: string | null = null
    let bgSpawn = false
    for (const part of lastMessage.parts) {
      const p = part as Record<string, unknown>
      if (p.type === 'step-start') depth++
      // AI SDK v6: static tools → "tool-{name}", dynamic → "dynamic-tool" + toolName
      if (typeof p.type === 'string' && p.type.startsWith('tool-')) {
        toolName = (p.type as string).slice(5)
        if (toolName === 'spawn_background_agent') bgSpawn = true
      } else if (p.type === 'dynamic-tool') {
        toolName = (p.toolName as string) ?? null
        if (toolName === 'spawn_background_agent') bgSpawn = true
      }
    }
    return { stepDepth: depth, lastToolName: toolName, hasBackgroundSpawn: bgSpawn }
  }, [isStreaming, messages])

  // Map tool names to human-readable progress labels
  const progressLabel = useMemo((): string | null => {
    if (!isStreaming || !lastToolName) return null
    const labels: Record<string, string> = {
      semantic_search: 'Searching memory...',
      keyword_grep: 'Looking for exact matches...',
      graph: 'Traversing the graph...',
      get_nodes: 'Fetching details...',
      search_by_time: 'Checking the timeline...',
      web_search: 'Checking the web...',
      spawn_background_agent: 'Searching in the background...',
      ask_captain: 'Preparing something for you...',
    }
    return labels[lastToolName] ?? null
  }, [isStreaming, lastToolName])

  // Compute singleton astronaut state with step-aware depth
  const astronautState = useMemo((): 'idle' | 'searching' | 'celebrating' | 'error' | 'listening' => {
    if (error) return 'error'
    if (showSuccess) return 'celebrating'
    if (isLoading) {
      // Step-depth-aware states during streaming
      if (hasBackgroundSpawn) return 'listening'     // handed off to background
      if (stepDepth >= 3) return 'listening'          // multi-step retrieval / deep exploration
      return 'searching'                              // initial steps
    }
    if (isAuthLoading || isLoadingConversation) return 'searching'
    return 'idle'
  }, [error, showSuccess, isLoading, isAuthLoading, isLoadingConversation, stepDepth, hasBackgroundSpawn])

  // Astronaut size: xl hero when user hasn't engaged, lg docked when they have
  const astronautSize = hasUserTyped ? 'lg' as const : 'xl' as const

  return {
    astronautState,
    astronautSize,
    progressLabel,
    hasBackgroundSpawn,
  }
}
