import { useEffect, useRef } from 'react'
import type { UIMessage } from 'ai'

interface VoyagerToolEffectsInput {
  status: string
  messages: UIMessage[]
  signOut: () => Promise<void>
  handleVoyageSwitch: (slug: string | null) => void
  refetchVoyages: () => void
  refetchOwnVoyagerIdentity: () => Promise<void>
  reloadFeed: () => Promise<void>
}

const isTool = (
  part: Record<string, unknown>,
  name: string,
): boolean => (
  part.type === `tool-${name}`
  || (part.type === 'dynamic-tool' && part.toolName === name)
)

export const useVoyagerToolEffects = ({
  status,
  messages,
  signOut,
  handleVoyageSwitch,
  refetchVoyages,
  refetchOwnVoyagerIdentity,
  reloadFeed,
}: VoyagerToolEffectsInput): void => {
  const refreshedNameToolCalls = useRef(new Set<string>())

  useEffect(() => {
    if (status !== 'ready' || messages.length === 0) return
    const lastMessage = messages.at(-1)
    if (lastMessage?.role !== 'assistant' || !Array.isArray(lastMessage.parts)) {
      return
    }
    const hasSignOut = lastMessage.parts.some((partValue) => (
      isTool(partValue as Record<string, unknown>, 'sign_out')
    ))
    if (!hasSignOut) return
    const timer = setTimeout(() => {
      void signOut()
    }, 1500)
    return () => clearTimeout(timer)
  }, [status, messages, signOut])

  useEffect(() => {
    if (status !== 'ready' || messages.length === 0) return
    const lastMessage = messages.at(-1)
    if (lastMessage?.role !== 'assistant' || !Array.isArray(lastMessage.parts)) {
      return
    }
    for (const partValue of lastMessage.parts) {
      const part = partValue as Record<string, unknown>
      if (!isTool(part, 'switch_voyage') || part.state !== 'output-available') {
        continue
      }
      try {
        const output = typeof part.output === 'string'
          ? JSON.parse(part.output) as Record<string, unknown>
          : part.output as Record<string, unknown>
        if (output?.switched) {
          const slug = output.voyageSlug !== undefined
            ? output.voyageSlug
            : output.slug
          handleVoyageSwitch(slug as string | null)
        }
      } catch {
        // A malformed historical tool result cannot change current context.
      }
    }
  }, [status, messages, handleVoyageSwitch])

  useEffect(() => {
    if (status !== 'ready' || messages.length === 0) return
    const lastMessage = messages.at(-1)
    if (lastMessage?.role !== 'assistant' || !Array.isArray(lastMessage.parts)) {
      return
    }
    for (const partValue of lastMessage.parts) {
      const part = partValue as Record<string, unknown>
      if (!isTool(part, 'create_voyage') || part.state !== 'output-available') {
        continue
      }
      try {
        const output = typeof part.output === 'string'
          ? JSON.parse(part.output) as Record<string, unknown>
          : part.output as Record<string, unknown>
        if (output?.created) refetchVoyages()
      } catch {
        // A malformed result cannot create a client-side voyage projection.
      }
    }
  }, [status, messages, refetchVoyages])

  useEffect(() => {
    if (status !== 'ready' || messages.length === 0) return
    const lastMessage = messages.at(-1)
    if (lastMessage?.role !== 'assistant' || !Array.isArray(lastMessage.parts)) {
      return
    }
    let completedRenameKey: string | null = null
    lastMessage.parts.some((partValue, index) => {
      const part = partValue as Record<string, unknown>
      if (!isTool(part, 'name_voyager') || part.state !== 'output-available') {
        return false
      }
      completedRenameKey = typeof part.toolCallId === 'string'
        ? part.toolCallId
        : `${lastMessage.id}:name_voyager:${index}`
      return true
    })
    if (
      !completedRenameKey
      || refreshedNameToolCalls.current.has(completedRenameKey)
    ) return
    refreshedNameToolCalls.current.add(completedRenameKey)
    void Promise.all([refetchOwnVoyagerIdentity(), reloadFeed()])
  }, [
    status,
    messages,
    refetchOwnVoyagerIdentity,
    reloadFeed,
  ])
}
