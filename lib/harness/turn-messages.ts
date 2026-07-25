// Prompt assembly for one turn — where the cacheable prefix and the per-turn
// context are laid out in the exact order the provider accepts.

import type { MessageRole } from '@/lib/supabase/types'

interface WindowedMessage { role: MessageRole; content: string }

const cacheControl = { anthropic: { cacheControl: { type: 'ephemeral' as const } } }

/**
 * Anthropic rejects system messages separated by user/assistant history. So the
 * cacheable system prefix goes first, and per-turn context goes at the FRONT of
 * the last user message with the raw user text after it. A request carrying no
 * user message at all keeps the older contiguous-system layout.
 */
export const composeTurnMessages = (
  staticPrefix: string,
  dynamicSuffix: string,
  windowedMessages: WindowedMessage[],
) => {
  const staticSystemMessage = {
    role: 'system' as const,
    content: staticPrefix,
    providerOptions: cacheControl,
  }
  const lastUserIndex = windowedMessages.findLastIndex((message) => message.role === 'user')
  const cachedPromptItems = windowedMessages.map((message, index) => ({
    ...message,
    ...(dynamicSuffix && index === lastUserIndex
      ? { content: `<context>\n${dynamicSuffix}\n</context>\n\n${message.content}` }
      : {}),
    ...(index === windowedMessages.length - 1 ? { providerOptions: cacheControl } : {}),
  }))
  const dynamicSystemMessages = dynamicSuffix && lastUserIndex === -1
    ? [{ role: 'system' as const, content: dynamicSuffix }]
    : []
  return [staticSystemMessage, ...dynamicSystemMessages, ...cachedPromptItems]
}
