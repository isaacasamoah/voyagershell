import { hasToolCall, stepCountIs, streamText } from 'ai'
import { reapStuckTasks } from '@/lib/agents/queue'
import { computeWindow, getTruncatedMessages } from '@/lib/conversation/window'
import type { ConversationMessage } from '@/lib/conversation'
import { detectReferenceSignals, retrieveForContinuity } from '@/lib/conversation/continuity'
import { log } from '@/lib/debug'
import { type KnowledgeNode } from '@/lib/knowledge'
import { detectLearningSignal, emitSignal } from '@/lib/learning/signals'
import { isVoyagerAside, stripVoyagerAside } from '@/lib/messaging/feed-types'
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
  const { userId, conversationId, voyageSlug, authState, messages, displayName } = ctx
  const lastUserMessage = messages.filter((message) => message.role === 'user').pop()
  const rawQuery = lastUserMessage?.content ?? ''
  const voyagerAside = isVoyagerAside(rawQuery)
  const queryText = voyagerAside ? stripVoyagerAside(rawQuery) : rawQuery
  if (voyagerAside && lastUserMessage) lastUserMessage.content = queryText

  const intent = detectActionIntent(queryText)
  host.defer(reapStuckTasks().catch(() => {}))

  log.message('Processing user message', {
    conversationId,
    voyageSlug,
    messageCount: messages.length,
    queryLength: queryText.length,
  })

  const conversationMessages: ConversationMessage[] = messages.map((message, index) => ({
    id: `msg-${index}`,
    conversationId: conversationId ?? '',
    role: message.role as 'user' | 'assistant',
    content: message.content,
    createdAt: host.now(),
  }))
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

  const windowedMessages = windowResult.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }))

  const roomResult = await runRoomTurn({ ctx, host, queryText, voyagerAside })
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
  const messagesWithCache = windowedMessages.map((message, index) => ({
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
    messages: [staticSystemMessage, ...dynamicSystemMessages, ...messagesWithCache],
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
