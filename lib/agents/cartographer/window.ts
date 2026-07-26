import { composeContextFromStream, renderMessagesForModel } from '@/lib/conversation/stream-context'
import { estimateTokens } from '@/lib/conversation/window'

const CONTEXT_MESSAGES_BEFORE = 5
const TRANSCRIPT_TOKEN_BUDGET = 12_000

/** Build a token-budgeted transcript anchored to the oldest unenriched event. */
export const buildEnrichmentWindow = async (
  sessionId: string,
  oldestUnenrichedTime: string,
  userId: string,
  voyageSlug?: string,
): Promise<string> => {
  const allMessages = await composeContextFromStream(
    userId,
    sessionId,
    voyageSlug ?? null,
    500,
  )
  if (allMessages.length === 0) return ''

  const modelMessages = renderMessagesForModel(allMessages)
  const anchorTime = new Date(oldestUnenrichedTime).getTime()
  let anchorIndex = modelMessages.findIndex((message) => (
    message.createdAt.getTime() >= anchorTime
  ))
  if (anchorIndex === -1) anchorIndex = 0

  const contextStart = Math.max(0, anchorIndex - CONTEXT_MESSAGES_BEFORE)
  const formatted = modelMessages
    .slice(contextStart)
    .map((message) => `${message.role}: ${message.content}`)
  const anchorOffset = anchorIndex - contextStart
  let totalTokens = 0
  const budgeted: string[] = []

  for (let index = anchorOffset; index < formatted.length; index++) {
    totalTokens += estimateTokens(formatted[index])
    budgeted.push(formatted[index])
  }

  for (let index = anchorOffset - 1; index >= 0; index--) {
    const messageTokens = estimateTokens(formatted[index])
    if (totalTokens + messageTokens > TRANSCRIPT_TOKEN_BUDGET) break
    totalTokens += messageTokens
    budgeted.unshift(formatted[index])
  }

  return budgeted.join('\n\n')
}
