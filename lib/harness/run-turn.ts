import { hasToolCall, stepCountIs, streamText } from 'ai'
import { runCartographer } from '@/lib/agents/cartographer'
import { reapStuckTasks } from '@/lib/agents/queue'
import { composeContextFromStream, renderMessagesForModel, type ConversationMessage } from '@/lib/conversation/stream-context'
import { computeWindow, getTruncatedMessages } from '@/lib/conversation/window'
import { detectReferenceSignals, retrieveForContinuity } from '@/lib/conversation/continuity'
import { log } from '@/lib/debug'
import { type KnowledgeNode } from '@/lib/knowledge'
import { detectLearningSignal, emitSignal } from '@/lib/learning/signals'
import { getRoomRoster, describeRoomForPrompt } from '@/lib/messaging/room-context'
import { resolveAddress } from '@/lib/messaging/address'
import { getOwnVoyagerIdentity } from '@/lib/messaging/handles'
import { resolveUserModelWithMeta } from '@/lib/models'
import { composeSystemPrompt, getBasePrompt } from '@/lib/prompts'
import {
  composeToolStrategy,
  createVoyagerTools,
  logRetrievalEvent,
} from '@/lib/retrieval'
import { detectActionIntent } from '@/lib/shell/intent'
import { finishTurn } from './finish-turn'
import { runRoomGate, runRoomTurn } from './room-turn'
import { composeTurnMessages } from './turn-messages'
import { claimTurnIngress } from './turn-ingress'
import type { HarnessHost, TurnContext, TurnResult } from './types'

export const runTurn = async (
  ctx: TurnContext,
  host: HarnessHost,
): Promise<TurnResult> => {
  const { userId, conversationId, voyageSlug, authState, newMessage, displayName } = ctx
  const rawQuery = newMessage
  // Reject agent-originated turns to prevent agents triggering each other.
  if ((ctx.originatorActorType ?? 'user') !== 'user') {
    log.api('runTurn refused a non-human-originated turn (loop guard)', {
      originatorActorType: ctx.originatorActorType,
      conversationId,
    }, 'warn')
    return { kind: 'empty' }
  }

  // Deferred extraction may be interrupted. Recover an audience-visible job
  // before this turn reads memory.
  if (!ctx.autoSent && rawQuery) {
    await runCartographer({ userId })
  }

  // Resolve private addressing against the user's handle, never model output.
  const ownIdentity = await getOwnVoyagerIdentity(userId)
  const ownVoyagerHandle = ownIdentity.handle
  const address = resolveAddress(rawQuery, {
    ownVoyagerHandle,
    ownVoyagerAliases: ['voyager'],
  })
  // Strip only the private aside. Names without @ remain ordinary room text.
  const queryText = address.mode === 'aside' ? address.stripped : rawQuery
  // An empty @own is not a message; auto-sent welcomes are the sole source-less turn.
  if (!queryText && !ctx.autoSent) return { kind: 'empty' }
  const voyagerIdentity = ownIdentity.displayName ? ownIdentity : undefined
  const intent = detectActionIntent(queryText)
  host.defer(reapStuckTasks().catch(() => {}))
  // The caller's own Voyager is the only brain this endpoint can execute.

  const streamContext = conversationId
    ? await composeContextFromStream(userId, conversationId, voyageSlug)
    : []
  const rawConversationMessages: ConversationMessage[] = [...streamContext]
  if (queryText) {
    rawConversationMessages.push({
      id: 'in-flight-user-message',
      conversationId: conversationId ?? '',
      role: 'user',
      content: queryText,
      createdAt: host.now(),
      authorDisplayName: null,
      authorUserId: userId,
      isPrivate: address.mode === 'aside',
    })
  }
  const conversationMessages: ConversationMessage[] = renderMessagesForModel(rawConversationMessages)
  log.message('Processing user message', {
    conversationId,
    voyageSlug,
    messageCount: conversationMessages.length,
    queryLength: queryText.length,
  })

  const windowResult = computeWindow(conversationMessages)
  const truncatedMessages = getTruncatedMessages(conversationMessages, windowResult)
  const referenceSignals = queryText ? detectReferenceSignals(queryText) : []
  let continuityContext: string | null = null
  if (referenceSignals.length > 0 || windowResult.hasMoreHistory) {
    continuityContext = await retrieveForContinuity(
      referenceSignals,
      queryText,
      truncatedMessages,
      {
        userId,
        voyageSlug: voyageSlug ?? undefined,
        conversationId: conversationId ?? '',
      },
    )
    if (continuityContext) {
      log.memory('Continuity context retrieved', {
        length: continuityContext.length,
        preview: continuityContext.slice(0, 80),
      })
    }
  }

  if (queryText && conversationId) {
    const learningSignal = detectLearningSignal(queryText)
    if (learningSignal) {
      log.memory('Learning signal detected', { signal: learningSignal })
      emitSignal({
        type: learningSignal,
        conversationId,
        userId,
        voyageSlug: voyageSlug ?? undefined,
        context: queryText.slice(0, 200),
        timestamp: host.now(),
      })
    }
  }
  const { messages: selectedWindowMessages } = windowResult
  const windowedMessages = selectedWindowMessages.map((message) => ({
    role: message.role,
    content: message.content,
  }))

  // Handle room commands and unresolved addresses before claiming a message.
  const gate = await runRoomGate({ ctx, queryText, address })
  if (gate.result) return gate.result
  const ingress = await claimTurnIngress(ctx, host, gate, queryText, address)
  if (ingress.result) return ingress.result
  const roomResult = runRoomTurn(gate.room, address)
  if (roomResult) return roomResult

  let staticPrefix: string
  let dynamicSuffix = ''
  let retrievedKnowledge: KnowledgeNode[] = []
  let retrievalEventId: string | null = null
  let workingMemoryUnitIds: string[] = []
  try {
    const composed = await composeSystemPrompt(userId, {
      profile: { id: userId, displayName },
      voyageSlug: voyageSlug ?? undefined,
      sessionId: conversationId,
      continuityContext,
      authState,
      voyagerIdentity,
      ownerName: displayName,
    })
    workingMemoryUnitIds = composed.workingMemoryUnitIds
    staticPrefix = composed.staticPrompt
    dynamicSuffix = composed.dynamicPrompt
    retrievedKnowledge = composed.retrieval.knowledge
    logRetrievalEvent({
      userId,
      conversationId,
      query: queryText,
      nodesReturned: composed.retrieval.knowledge,
      threshold: composed.retrieval.metadata.threshold,
      pinnedCount: composed.retrieval.metadata.pinnedCount,
      searchCount: composed.retrieval.metadata.searchCount,
      latencyMs: composed.retrieval.metadata.latencyMs,
      tokensInContext: composed.retrieval.tokenEstimate,
    }).then((id) => {
      retrievalEventId = id
    })
  } catch (error) {
    log.api('Prompt composition failed, using base prompt', { error: String(error) }, 'warn')
    staticPrefix = getBasePrompt()
  }

  const toolContext = {
    userId,
    voyageSlug: voyageSlug ?? undefined,
    conversationId,
    waitUntil: (promise: Promise<unknown>) => host.defer(promise),
    messages: windowedMessages,
    workingMemoryUnitIds,
  }
  const { tools, registrations } = createVoyagerTools(toolContext)
  const toolStrategy = composeToolStrategy(registrations)
  staticPrefix = `${staticPrefix}\n\n${toolStrategy}`

  // Give the model the current roster, including invitations not yet accepted.
  if (ctx.conversationId) {
    try {
      const roster = await getRoomRoster(ctx.conversationId, ctx.userId)
      dynamicSuffix += describeRoomForPrompt(roster, {
        currentTurnPrivate: address.mode === 'aside',
      })
    } catch { /* roster is additive context — never block the turn */ }
  }

  if (intent) {
    if (intent.verb === 'switch' && !intent.target) {
      dynamicSuffix += '\n[Shell: intent detected — switch. No target specified. Help the user choose a voyage.]'
    } else if (intent.verb === 'do' && intent.payload) {
      dynamicSuffix += `\n[Shell: intent detected — do. Payload: "${intent.payload}". Determine which action tool applies.]`
    } else {
      const target = intent.target ? ` ${intent.target}` : ''
      dynamicSuffix += `\n[Shell: intent detected — ${intent.verb}${target}. Ensure the corresponding tool is called.]`
    }
  }

  const { model: chatModel, label: chatModelLabel } = await resolveUserModelWithMeta(
    { task: 'chat', quality: 'balanced', streaming: true, toolUse: true },
    userId,
  )
  const result = streamText({
    model: chatModel,
    messages: composeTurnMessages(staticPrefix, dynamicSuffix, windowedMessages),
    tools,
    maxOutputTokens: 4096,
    stopWhen: [stepCountIs(15), hasToolCall('spawn_background_agent')],
    onFinish: (event) => finishTurn(event, {
      ctx,
      host,
      intent,
      chatModelLabel,
      retrievalEventId: () => retrievalEventId,
      retrievedKnowledge,
      sourceEventId: ingress.outcome?.eventId ?? null,
    }),
  })

  // Keep draining after browser disconnect so onFinish can persist the reply.
  // The host keeps deferred work alive within its execution limit; persistence
  // remains in the single finish callback, with no partial-snapshot writer.
  host.defer(Promise.resolve(result.consumeStream({
    onError: (error) => log.api('Turn stream drain failed', { error: String(error) }, 'error'),
  })))

  return { kind: 'stream', result }
}
