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
import { capitalizeName, resolveAddress } from '@/lib/messaging/address'
import { getOwnVoyagerIdentity, listRoomVoyagerHandles } from '@/lib/messaging/handles'
import { isHumanTurnInput } from '@/lib/messaging/public-reply'
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
import type { HarnessHost, SummonResolution, TurnContext, TurnResult } from './types'

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
  if (!isHumanTurnInput(ctx.originatorActorType ?? 'user')) {
    log.api('runTurn refused a non-human-originated turn (loop guard)', {
      originatorActorType: ctx.originatorActorType,
      conversationId,
    }, 'warn')
    return { kind: 'empty' }
  }

  // Resolve the address ONCE, server-side, from the real handle set — the same
  // pure resolver the composer badge uses (Principle 1: privacy is computed,
  // never model-guessed). `voyager` survives only as an alias for your own.
  const [ownIdentity, roomVoyagerHandles] = await Promise.all([
    getOwnVoyagerIdentity(userId),
    conversationId ? listRoomVoyagerHandles(conversationId, userId) : Promise.resolve([]),
  ])
  const ownVoyagerHandle = ownIdentity.handle
  const address = resolveAddress(rawQuery, {
    ownVoyagerHandle,
    ownVoyagerAliases: ['voyager'],
    roomVoyagerHandles,
  })
  // Strip only the private aside — a summon keeps its raw text so the room
  // fan-out preserves the vocative humans see.
  const queryText = address.mode === 'aside' ? address.stripped : rawQuery

  // cut ④ — resolve WHOSE voyager answers. A cross-owner summon (Elisheya says
  // "wren, …") runs on Isaac's brain + identity + context and persists under
  // Isaac; a self-summon / aside / plain turn collapses to the summoner. The
  // owner is the identity of record for the reply (§6.5).
  const isCrossOwnerSummon = address.mode === 'summon' && Boolean(address.targetOwnerUserId)
  const brainUserId = isCrossOwnerSummon ? (address.targetOwnerUserId as string) : userId
  const summonedVoyagerName = address.mode === 'summon'
    ? (isCrossOwnerSummon
        ? (address.targetVoyagerName ?? null)
        : (ownIdentity.name ? capitalizeName(ownIdentity.name) : null))
    : (ownIdentity.name ? capitalizeName(ownIdentity.name) : null)
  const summon: SummonResolution = {
    mode: address.mode,
    summonerUserId: userId,
    voyagerOwnerUserId: brainUserId,
    voyagerName: summonedVoyagerName,
    voyagerOwnerName: isCrossOwnerSummon ? (address.targetOwnerName ?? 'someone') : (displayName ?? 'someone'),
  }

  const intent = detectActionIntent(queryText)
  host.defer(reapStuckTasks().catch(() => {}))

  // Compose the turn context for the BRAIN user — the owner on a cross-owner
  // summon. Privacy is enforced structurally by the participants-gated read:
  // the owner only ever sees rows they are a participant of.
  const streamContext = conversationId
    ? await composeContextFromStream(brainUserId, conversationId, voyageSlug)
    : []
  const rawConversationMessages: ConversationMessage[] = [...streamContext]
  if (queryText) {
    rawConversationMessages.push({
      id: 'in-flight-user-message',
      conversationId: conversationId ?? '',
      role: 'user',
      content: queryText,
      createdAt: host.now(),
      // On a cross-owner summon the in-flight utterance is ANOTHER human's — the
      // owner's brain must read it as "[Elisheya]: …", never as its own words.
      authorDisplayName: isCrossOwnerSummon ? (displayName ?? null) : null,
      authorUserId: userId,
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
        // Cross-session continuity searches the BRAIN user's past conversations —
        // Isaac's Wren recalls Isaac's history, never the summoner's. Anchoring on
        // the summoner would inject THEIR private "[From previous conversations]"
        // into the owner's publicly-fanned reply (the same §6.5 leak the prompt
        // composition below closes). Self-summon: brainUserId === userId, unchanged.
        userId: brainUserId,
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

  // In-turn tools stay bound to the SUMMONER (userId), NOT the brain owner — a
  // cross-owner summon must never let a bystander's words drive WRITES (add to
  // room, set display name, actions) against the owner's account. Read tools
  // therefore read the summoner's own data; the reply's grounding (persona,
  // knowledge, continuity) is the owner's. Whether a summoned voyager should act
  // on the owner's account at all is a deferred design question (owner-summon
  // toggle, out of scope) — left summoner-scoped as the safe default.
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
    // The Voyager speaks as the SUMMONED voyager — its owner's identity. On a
    // cross-owner summon that is Isaac's Wren (name + owner from the resolved
    // summon), not the summoner's own. The derived default (`<username>.voyager`)
    // is an addressing fallback, not a name — provenance is decided in the data
    // layer, so `summonedVoyagerName` is already null when unnamed.
    const voyagerName = summonedVoyagerName ?? undefined
    // Compose the prompt on the BRAIN user — a cross-owner summon runs Isaac's
    // Wren on ISAAC's persona + curated knowledge + retrieval, never the
    // summoner's. Anchoring on `userId` here would ground a publicly-fanned reply
    // in the SUMMONER's private "What I Know About You" while attributing it to
    // the owner — leaking the summoner's data under someone else's name. The
    // model + context already resolve on brainUserId; identity must too (C2).
    const { staticPrompt, dynamicPrompt, retrieval } = await composeSystemPrompt(brainUserId, {
      profile: { id: brainUserId, displayName: isCrossOwnerSummon ? summon.voyagerOwnerName : displayName },
      voyageSlug: voyageSlug ?? undefined,
      sessionId: conversationId,
      continuityContext,
      authState,
      voyagerName,
      ownerName: summon.voyagerOwnerName,
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

  // Resolve the model on the BRAIN user — a cross-owner summon runs on the
  // owner's brain (their model choice / BYO key), not the summoner's.
  const { model: chatModel, label: chatModelLabel } = await resolveUserModelWithMeta(
    { task: 'chat', quality: 'balanced', streaming: true, toolUse: true },
    brainUserId,
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
      summon,
    }),
  })

  return { kind: 'stream', result }
}
