import type { StreamTextOnFinishCallback, ToolSet } from 'ai'
import { runCartographer, shouldRunEnrichment } from '@/lib/agents/cartographer'
import { createMessageEvent, type KnowledgeNode } from '@/lib/knowledge'
import { creditTracker, modelRouter } from '@/lib/models'
import { planPublicReply } from '@/lib/messaging/public-reply'
import { fanOutDeliveries } from '@/lib/messaging/deliveries'
import { getActiveMemberIds } from '@/lib/messaging/room'
import { logCitations } from '@/lib/retrieval'
import { reconcileActions } from '@/lib/shell/reconciler'
import type { ActionIntent } from '@/lib/shell/types'
import { log } from '@/lib/debug'
import type { HarnessHost, SummonResolution, TurnContext } from './types'

interface FinishTurnContext {
  ctx: TurnContext
  host: HarnessHost
  intent: ActionIntent | null
  chatModelLabel: string
  retrievalEventId: () => string | null
  retrievedKnowledge: KnowledgeNode[]
  // cut ④ — how this turn was addressed + whose voyager answered. finishTurn
  // plans the reply's persistence/fan-out from it (public summon → the room;
  // aside/solo → private to the asker, unchanged).
  summon: SummonResolution
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
      // Recompute the active roster FRESH at reply time (turn-end), never a
      // turn-start snapshot — the stream may have outlived a join/leave.
      const activeMemberIds = await getActiveMemberIds(conversationId, userId)
      const { summon } = options
      // The public-voice decision: a leading-name summon in a populated room
      // fans the reply under the OWNER as a `message` event (§6.5); everything
      // else (aside, solo, plain) stays the private per-asker `conversation`.
      const plan = planPublicReply({
        mode: summon.mode,
        summonerUserId: summon.summonerUserId,
        voyagerOwnerUserId: summon.voyagerOwnerUserId,
        voyagerName: summon.voyagerName ?? '',
        voyagerOwnerName: summon.voyagerOwnerName,
        activeMemberIds,
      })
      const eventId = await createMessageEvent(conversationId, plan.role, text, {
        userId: plan.userId,
        voyageSlug: voyageSlug ?? undefined,
        participants: plan.participants,
        eventType: plan.eventType,
        addressedTo: plan.recipients.length > 0 ? plan.recipients : undefined,
        source: plan.source,
        senderDisplayName: plan.senderDisplayName,
        ownerDisplayName: plan.ownerDisplayName,
      })
      if (plan.fanOut && eventId) await fanOutDeliveries(eventId, plan.recipients)
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
