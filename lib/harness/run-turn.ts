import { hasToolCall, stepCountIs, streamText } from 'ai'
import { reapStuckTasks } from '@/lib/agents/queue'
import { composeContextFromStream } from '@/lib/conversation'
import { renderMessagesForModel } from '@/lib/conversation/stream-context'
import { computeWindow, getTruncatedMessages } from '@/lib/conversation/window'
import type { ConversationMessage } from '@/lib/conversation'
import { detectReferenceSignals, retrieveForContinuity } from '@/lib/conversation/continuity'
import { log } from '@/lib/debug'
import { type KnowledgeNode } from '@/lib/knowledge'
import { detectLearningSignal, emitSignal } from '@/lib/learning/signals'
import { getRoomRoster, describeRoomForPrompt } from '@/lib/messaging/room'
import { resolveAddress } from '@/lib/messaging/address'
import { getOwnVoyagerHandle, listRoomVoyagerHandles } from '@/lib/messaging/handles'
import { resolveUserModelWithMeta } from '@/lib/models'
import { composeSystemPrompt, getBasePrompt } from '@/lib/prompts'
import {
  composeToolStrategy,
  createVoyagerTools,
  logRetrievalEvent,
} from '@/lib/retrieval'
import { detectActionIntent } from '@/lib/shell/intent'
import { finishTurn } from './finish-turn'
import { runRoomTurn } from './room-turn'
import type { HarnessHost, TurnContext, TurnResult } from './types'

export const runTurn = async (
  ctx: TurnContext,
  host: HarnessHost,
): Promise<TurnResult> => {
  const { userId, conversationId, voyageSlug, authState, newMessage, displayName } = ctx
  const rawQuery = newMessage

  // Resolve the address ONCE, server-side, from the real handle set — the same
  // pure resolver the composer badge uses (Principle 1: privacy is computed,
  // never model-guessed). `voyager` survives only as an alias for your own.
  const [ownVoyagerHandle, roomVoyagerHandles] = await Promise.all([
    getOwnVoyagerHandle(userId),
    conversationId ? listRoomVoyagerHandles(conversationId, userId) : Promise.resolve([]),
  ])
  const address = resolveAddress(rawQuery, {
    ownVoyagerHandle,
    ownVoyagerAliases: ['voyager'],
    roomVoyagerHandles,
  })
  // Strip only the private aside — a summon keeps its raw text so the room
  // fan-out preserves the vocative humans see.
  const queryText = address.mode === 'aside' ? address.stripped : rawQuery

  const intent = detectActionIntent(queryText)
  host.defer(reapStuckTasks().catch(() => {}))

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

  const roomResult = await runRoomTurn({ ctx, host, queryText, address })
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

  // Room truth: the model NEVER guesses membership — inject the code-attested
  // roster (active vs invited-not-joined) into the dynamic prompt every turn.
  if (ctx.conversationId) {
    try {
      const roster = await getRoomRoster(ctx.conversationId)
      dynamicSuffix += describeRoomForPrompt(roster)
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

  const cacheControl = { anthropic: { cacheControl: { type: 'ephemeral' as const } } }
  const staticSystemMessage = {
    role: 'system' as const,
    content: staticPrefix,
    providerOptions: cacheControl,
  }
  // Anthropic rejects system messages separated by user/assistant history.
  // Keep the cacheable system prefix first and place per-turn context at the
  // front of the last user message, leaving the raw user text after it.
  const lastUserIndex = windowedMessages.findLastIndex((message) => message.role === 'user')
  const cachedPromptItems = windowedMessages.map((message, index) => ({
    ...message,
    ...(dynamicSuffix && index === lastUserIndex
      ? { content: `<context>\n${dynamicSuffix}\n</context>\n\n${message.content}` }
      : {}),
    ...(index === windowedMessages.length - 1
      ? { providerOptions: cacheControl }
      : {}),
  }))
  // Requests without a user message retain the old contiguous-system layout.
  const dynamicSystemMessages = dynamicSuffix && lastUserIndex === -1
    ? [{ role: 'system' as const, content: dynamicSuffix }]
    : []

  const { model: chatModel, label: chatModelLabel } = await resolveUserModelWithMeta(
    { task: 'chat', quality: 'balanced', streaming: true, toolUse: true },
    userId,
  )
  const result = streamText({
    model: chatModel,
    messages: [staticSystemMessage, ...dynamicSystemMessages, ...cachedPromptItems],
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
    }),
  })

  return { kind: 'stream', result }
}
