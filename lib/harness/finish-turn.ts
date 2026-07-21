import type { StreamTextOnFinishCallback, ToolSet } from 'ai'
import { runCartographer, shouldRunEnrichment } from '@/lib/agents/cartographer'
import { createMessageEvent, type KnowledgeNode } from '@/lib/knowledge'
import { creditTracker, modelRouter } from '@/lib/models'
import { logCitations } from '@/lib/retrieval'
import { reconcileActions } from '@/lib/shell/reconciler'
import type { ActionIntent } from '@/lib/shell/types'
import { log } from '@/lib/debug'
import type { HarnessHost, TurnContext } from './types'

interface FinishTurnContext {
  ctx: TurnContext
  host: HarnessHost
  intent: ActionIntent | null
  chatModelLabel: string
  retrievalEventId: () => string | null
  retrievedKnowledge: KnowledgeNode[]
}

type FinishEvent = Parameters<StreamTextOnFinishCallback<ToolSet>>[0]

export const finishTurn = async (
  event: FinishEvent,
  options: FinishTurnContext,
): Promise<void> => {
  const { text, steps, finishReason, usage, providerMetadata } = event
  const { ctx, host, intent, chatModelLabel, retrievedKnowledge } = options
  const { userId, conversationId, voyageSlug } = ctx

  if (intent) {
    const allToolCalls = steps.flatMap((step) => step.toolCalls)
    host.defer(reconcileActions(
      intent,
      allToolCalls.map((toolCall) => ({ toolName: toolCall.toolName })),
      text ?? '',
      { userId, voyageSlug: voyageSlug ?? undefined, conversationId },
    ).catch((error) => log.api(
      'Shell reconciliation error',
      { error: String(error) },
      'error',
    )))
  }

  const cacheCreationTokens =
    (providerMetadata?.anthropic?.cacheCreationInputTokens as number) ?? 0
  const cacheReadTokens =
    (providerMetadata?.anthropic?.cacheReadInputTokens as number) ?? 0

  log.message('Stream complete', {
    textLength: text?.length ?? 0,
    finishReason,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
  })

  if (usage) {
    const inputTokens = usage.inputTokens ?? 0
    const outputTokens = usage.outputTokens ?? 0
    const onDefaultProvider = chatModelLabel === 'claude-sonnet'
    creditTracker.track({
      userId,
      model: chatModelLabel,
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      cost: onDefaultProvider
        ? modelRouter.estimateCost(chatModelLabel, inputTokens, outputTokens)
        : 0,
      task: 'chat',
      conversationId,
    })
  }

  if (conversationId && text) {
    try {
      // A Voyager reply is always an owner-private conversation event. The only
      // boundary into a room is the explicit Share command, which creates a new
      // human-authored message after revalidating source + fresh membership.
      await createMessageEvent(conversationId, 'assistant', text, {
        userId,
        voyageSlug: voyageSlug ?? undefined,
        participants: [userId],
        eventType: 'conversation',
      })
      logCitations(options.retrievalEventId(), text, retrievedKnowledge)

      if (await shouldRunEnrichment(conversationId, userId)) {
        host.defer(runCartographer({
          sessionId: conversationId,
          userId,
          voyageSlug: voyageSlug ?? undefined,
        }))
      }
    } catch (error) {
      console.error('[Chat] Failed to persist assistant event:', error)
    }
  }
}
