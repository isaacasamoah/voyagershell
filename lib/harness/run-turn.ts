import { hasToolCall, stepCountIs, streamText } from 'ai'
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

  // ── The loop guard (the hard rule, code-attested) ─────────────────────────
  // A Voyager turn may begin ONLY on human-authored input. actor=voyager events
  // NEVER trigger another Voyager's turn — two named Voyagers cannot answer each
  // other unbidden (§4). This holds by architecture today (the only caller is a
  // human POST /api/chat), but the invariant lives HERE so a future realtime→turn
  // bridge that forwards a voyager-authored event is caught, not silently looped.
  if ((ctx.originatorActorType ?? 'user') !== 'user') {
    log.api('runTurn refused a non-human-originated turn (loop guard)', {
      originatorActorType: ctx.originatorActorType,
      conversationId,
    }, 'warn')
    return { kind: 'empty' }
  }

  // Resolve the address ONCE, server-side, from the real handle set — the same
  // pure resolver the composer badge uses (Principle 1: privacy is computed,
  // never model-guessed). `voyager` survives only as an alias for your own.
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

  // The room grammar and the held-address gate run first — neither is a message
  // and neither may reach the ledger. Then the ingress claim, before any effect.
  const gate = await runRoomGate({ ctx, queryText, address })
  if (gate.result) return gate.result
  const ingress = await claimTurnIngress(ctx, host, gate, queryText, address)
  if (ingress.result) return ingress.result

  const roomResult = runRoomTurn(gate.room, address)
  if (roomResult) return roomResult

  const { tools, registrations } = createVoyagerTools({
    userId,
    voyageSlug: voyageSlug ?? undefined,
    conversationId,
    waitUntil: (promise) => host.defer(promise),
    messages: windowedMessages,
  })
  const toolStrategy = composeToolStrategy(registrations)

  let staticPrefix: string
  let dynamicSuffix = ''
  let retrievedKnowledge: KnowledgeNode[] = []
  let retrievalEventId: string | null = null
  try {
    const { staticPrompt, dynamicPrompt, retrieval } = await composeSystemPrompt(userId, {
      profile: { id: userId, displayName },
      voyageSlug: voyageSlug ?? undefined,
      sessionId: conversationId,
      continuityContext,
      authState,
      voyagerIdentity,
      ownerName: displayName,
    })
    staticPrefix = `${staticPrompt}\n\n${toolStrategy}`
    dynamicSuffix = dynamicPrompt
    retrievedKnowledge = retrieval.knowledge
    logRetrievalEvent({
      userId,
      conversationId,
      query: queryText,
      nodesReturned: retrieval.knowledge,
      threshold: retrieval.metadata.threshold,
      pinnedCount: retrieval.metadata.pinnedCount,
      searchCount: retrieval.metadata.searchCount,
      latencyMs: retrieval.metadata.latencyMs,
      tokensInContext: retrieval.tokenEstimate,
    }).then((id) => {
      retrievalEventId = id
    })
  } catch (error) {
    log.api('Prompt composition failed, using base prompt', { error: String(error) }, 'warn')
    staticPrefix = `${getBasePrompt()}\n\n${toolStrategy}`
  }

  // Room truth: the model NEVER guesses membership — the code-attested roster
  // (active vs invited-not-joined) goes into the dynamic prompt every turn.
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

  // ── The reply is the server's to finish, not the client's ─────────────────
  // The response stream advances only while something pulls it, and the browser
  // was the only puller. A reload, a closed tab or a navigation cancels the body,
  // the pull stops, and onFinish — where finishTurn writes the assistant event —
  // never runs: the user's own message lands and the answer disappears silently.
  // Draining here removes that dependency, so the turn completes on the server
  // whether or not anyone is listening and the WHOLE reply is persisted. There
  // is deliberately no partial-snapshot path — the finish callback is the single
  // writer, it fires once on the recorded base stream however many consumers
  // read it, and a stream that dies mid-generation never reaches it at all.
  // Complete or nothing; never a truncated answer stored as if it were full.
  // Deferred through the host so the serverless invocation outlives the response
  // it already returned.
  host.defer(Promise.resolve(result.consumeStream({
    onError: (error) => log.api('Turn stream drain failed', { error: String(error) }, 'error'),
  })))

  return { kind: 'stream', result }
}
