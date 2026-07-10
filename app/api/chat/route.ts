import { streamText, stepCountIs, hasToolCall, APICallError, createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { waitUntil } from '@vercel/functions';
import { composeSystemPrompt, getBasePrompt } from '@/lib/prompts';
import {
  saveMessage,
  type ConversationMessage,
} from '@/lib/conversation';
import { computeWindow, getTruncatedMessages } from '@/lib/conversation/window';
import {
  detectReferenceSignals,
  retrieveForContinuity,
} from '@/lib/conversation/continuity';
import { detectLearningSignal, emitSignal } from '@/lib/learning/signals';
import { emitMessageEvent, createMessageEvent, type KnowledgeNode } from '@/lib/knowledge';
import { getRoom, removeRoomPerson, setAiPresent, parseRoomCommand } from '@/lib/messaging/room';
import { inviteToRoom, linkPendingSpace } from '@/lib/messaging/invites';
import { fanOutDeliveries } from '@/lib/messaging/deliveries';
import { logRetrievalEvent, logCitations, createVoyagerTools, composeToolStrategy } from '@/lib/retrieval';
import { requireAuthResponse } from '@/lib/auth';
import { shouldRunEnrichment, runCartographer } from '@/lib/agents/cartographer';
import { reapStuckTasks } from '@/lib/agents/queue';
import { modelRouter, creditTracker, resolveUserModelWithMeta } from '@/lib/models';
import { resolveSessionVoyage, SessionAccessError, getVoyageBySlug, getVoyageMembers, resolveMemberByName } from '@/lib/voyage';
import { log } from '@/lib/debug';
import { detectActionIntent } from '@/lib/shell/intent';
import { reconcileActions } from '@/lib/shell/reconciler';
import { detectRetrievalSignals, dispatchRetrievalAgent } from '@/lib/shell/signals';

export const maxDuration = 30;


// Message types for AI SDK v6
interface UIMessagePart {
  type: string;
  text?: string;
}

interface UIMessage {
  role: 'user' | 'assistant' | 'system';
  parts?: UIMessagePart[];
  content?: string;
}

interface SimpleMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Convert UIMessage format (parts array) to simple message format
const convertToSimpleMessages = (messages: UIMessage[]): SimpleMessage[] => {
  return messages
    .map((msg) => {
      // Extract text content from parts array (AI SDK v6 format)
      let content: string;
      if (msg.parts && Array.isArray(msg.parts)) {
        content = msg.parts
          .filter((part) => part.type === 'text' && part.text)
          .map((part) => part.text)
          .join('');
      } else if (typeof msg.content === 'string') {
        content = msg.content;
      } else {
        content = '';
      }

      return {
        role: msg.role,
        content,
      };
    })
    .filter((msg) => msg.content.trim() !== ''); // Filter out empty messages
};

export const POST = async (req: Request) => {
  log.api('Chat request received');

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        error: 'Configuration error',
        message: 'ANTHROPIC_API_KEY is not configured'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    // Require authentication
    const authResult = await requireAuthResponse();
    if (authResult instanceof Response) return authResult;
    const userId = authResult;
    void reapStuckTasks().catch(() => {});

    const { messages, conversationId, authState, autoSent } = await req.json();

    // Messaging v2 — the session IS the context. Voyage is derived from the
    // session (conversationId → session.voyage_id), never from a request
    // field. No client/server reconciliation, no mismatch class: one source
    // of truth. A message inherits this voyage, so it can never leak to a
    // null/wrong voyage the way the old dual-channel model did.
    let voyageSlug: string | undefined = undefined;
    try {
      voyageSlug = (await resolveSessionVoyage(conversationId || undefined, userId)) ?? undefined;
    } catch (err) {
      if (err instanceof SessionAccessError) {
        return new Response(JSON.stringify({ error: 'session_access_denied' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw err;
    }

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request',
          message: 'messages array is required'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Convert from UIMessage format to simple message format
    const simpleMessages = convertToSimpleMessages(messages);

    // Extract the last user message for context retrieval
    const lastUserMessage = simpleMessages
      .filter((m) => m.role === 'user')
      .pop();
    // `@voyager …` — a ONE-SHOT private aside to your own co-pilot. Detect +
    // strip the prefix HERE, before intent detection, so the model and the
    // reconciler see a clean query (no spurious "tell voyager" intent) and the
    // saved transcript/knowledge is prefix-free. The aside bypasses the room
    // below (not fanned to humans; answered even if Voyager stepped out).
    const rawQuery = lastUserMessage?.content ?? '';
    const voyagerAside = /^@voyager\b/i.test(rawQuery.trim());
    const queryText = voyagerAside
      ? rawQuery.replace(/^@voyager[\s,:!.?-]*/i, '').trim()
      : rawQuery;
    if (voyagerAside && lastUserMessage) lastUserMessage.content = queryText;

    // Shell Contract: detect verb intent before LLM runs
    const intent = detectActionIntent(queryText);

    // Shell Contract: detect retrieval signals alongside verb detection
    const retrievalSignals = detectRetrievalSignals(queryText);

    log.message('Processing user message', {
      conversationId,
      voyageSlug,
      messageCount: simpleMessages.length,
      queryLength: queryText.length,
    });

    // =============================================================================
    // CONVERSATION CONTINUITY: Sliding Window + Reference Detection
    // =============================================================================

    // Convert to ConversationMessage format for window computation
    const conversationMessages: ConversationMessage[] = simpleMessages.map((m, i) => ({
      id: `msg-${i}`,
      conversationId: conversationId ?? '',
      role: m.role as 'user' | 'assistant',
      content: m.content,
      createdAt: new Date(),
    }));

    // Compute token-budgeted sliding window
    const windowResult = computeWindow(conversationMessages);
    const truncatedMessages = getTruncatedMessages(conversationMessages, windowResult);

    // Detect reference signals in user message (implicit: "that thing", temporal: "earlier")
    const referenceSignals = queryText ? detectReferenceSignals(queryText) : [];

    // Retrieve continuity context if signals detected or messages were truncated
    let continuityContext: string | null = null;
    if (referenceSignals.length > 0 || windowResult.hasMoreHistory) {
      continuityContext = await retrieveForContinuity(
        referenceSignals,
        queryText,
        truncatedMessages,
        { userId, voyageSlug, conversationId: conversationId ?? '' }
      );
      if (continuityContext) {
        log.memory('Continuity context retrieved', { length: continuityContext.length, preview: continuityContext.slice(0, 80) });
      }
    }

    // Detect and emit learning signals (corrections, re-explanations)
    if (queryText && conversationId) {
      const learningSignal = detectLearningSignal(queryText);
      if (learningSignal) {
        log.memory('Learning signal detected', { signal: learningSignal });
        emitSignal({
          type: learningSignal,
          conversationId,
          userId,
          voyageSlug,
          context: queryText.slice(0, 200),
          timestamp: new Date(),
        });
      }
    }

    // Use windowed messages for the LLM context
    const windowedSimpleMessages = windowResult.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Fetch user profile for display name (prompt composition needs it)
    const { getAdminClient: getAdmin } = await import('@/lib/supabase/admin');
    const adminClient = getAdmin();
    const { data: userProfile } = await adminClient
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle();
    const displayName = (userProfile as { display_name: string | null } | null)?.display_name ?? undefined;

    // ── The Room ──────────────────────────────────────────────────────────
    // Resolve room state + voyage members ONCE (used by commands, fan-out, gate).
    let room = conversationId
      ? await getRoom(conversationId)
      : { roomPeople: [], aiPresent: true };
    const voyage = voyageSlug ? await getVoyageBySlug(voyageSlug) : null;
    const voyageMembers = voyage ? await getVoyageMembers(voyage.id) : [];

    // Deterministic `+`/`−` room grammar — handled BEFORE any save so it can
    // never be confabulated AND never pollutes the transcript/knowledge base.
    // Ephemeral: no saved turn, no knowledge event; a live confirmation, return.
    // If `+X`/`-X` doesn't resolve to a real member (e.g. "+1", "- done"), it
    // wasn't a command → fall through to a normal message.
    const roomCmd = queryText ? parseRoomCommand(queryText) : null;
    if (roomCmd && conversationId) {
      let confirmation: string | null = null;
      if (roomCmd.op === 'voyager-in') {
        await setAiPresent(conversationId, true);
        confirmation = 'Back in the room.';
      } else if (roomCmd.op === 'voyager-out') {
        await setAiPresent(conversationId, false);
        confirmation = 'Stepped out — just you and whoever else is here. Say +voyager to bring me back.';
      } else if (voyageSlug && (roomCmd.op === 'add' || roomCmd.op === 'remove')) {
        const match = resolveMemberByName(voyageMembers, roomCmd.name);
        if (match && match.userId !== userId) {
          if (roomCmd.op === 'add') {
            const invite = await inviteToRoom(conversationId, match.userId);
            if (invite.state === 'invited') {
              const me = voyageMembers.find((m) => m.userId === userId);
              const senderName = me?.displayName ?? me?.email ?? 'Someone';
              const eventId = await createMessageEvent(conversationId, 'user',
                `${senderName} invited you to a room — reply to join.`, {
                  userId, voyageSlug, participants: [match.userId],
                  addressedTo: [match.userId], source: 'invite',
                  senderDisplayName: senderName, senderUserId: userId,
                  attentionScore: 0.9,
                  contextSnippet: `${senderName} invited you to a room`,
                })
              if (eventId) void fanOutDeliveries(eventId, [match.userId])
              confirmation = `Invited ${match.displayName} — they'll see it and can hop in by replying. (I've stepped back; say +voyager to bring me in.)`;
            } else {
              confirmation = `Added ${match.displayName} — they'll get what you type here. (I've stepped back; say +voyager to bring me in.)`;
            }
          } else {
            await removeRoomPerson(conversationId, match.userId);
            confirmation = `Removed ${match.displayName} from the room.`;
          }
        }
      }
      if (confirmation !== null) {
        const msg = confirmation;
        const stream = createUIMessageStream({
          execute: async ({ writer }) => {
            const id = 'room-cmd';
            writer.write({ type: 'text-start', id });
            writer.write({ type: 'text-delta', id, delta: msg });
            writer.write({ type: 'text-end', id });
          },
        });
        return createUIMessageStreamResponse({ stream });
      }
      // fell through (not a real command) → treat as a normal message below.
    }

    // Reciprocal accept: the invitee's first message accepts a pending invite and
    // links her session to the shared space, making the room two-sided.
    if (conversationId && queryText && voyage && !autoSent) {
      const link = await linkPendingSpace(conversationId, userId, voyage.id)
      if (link.linked) room = await getRoom(conversationId)
    }

    // Save user message to DB (transcript). A ROOM message skips the extra
    // 'conversation' knowledge event — it emits a 'room' message event below,
    // so the same content is never double-written into the knowledge base.
    // The synthetic auto-sent welcome ('good morning') is NEVER persisted — it
    // only triggers Voyager's greeting; persisting it would render a fake user
    // turn in the event-stream feed.
    if (conversationId && queryText && !autoSent) {
      saveMessage(conversationId, 'user', queryText).catch((error) => {
        console.error('[Chat] Failed to save user message:', error);
      });
      if (room.roomPeople.length === 0 || voyagerAside) {
        emitMessageEvent(conversationId, 'user', queryText, {
          userId,
          voyageSlug,
          participants: [userId],
          eventType: 'conversation',
        });
      }
    }

    // Room fan-out — deliver to CURRENT voyage members only. A person who left
    // the voyage after being added must not still receive room messages.
    if (conversationId && queryText && room.roomPeople.length > 0 && !voyagerAside) {
      const currentIds = new Set(voyageMembers.map((m) => m.userId));
      const recipients = room.roomPeople.filter((id) => id !== userId && currentIds.has(id));
      if (recipients.length > 0) {
        const me = voyageMembers.find((m) => m.userId === userId);
        const senderName = me?.displayName ?? me?.email ?? 'Someone';
        const eventId = await createMessageEvent(conversationId, 'user', queryText, {
          userId,
          voyageSlug,
          participants: [userId, ...recipients],
          addressedTo: recipients,
          source: 'room',
          senderDisplayName: senderName,
          senderUserId: userId,
          attentionScore: 0.85,
          contextSnippet: `${senderName} in room: ${queryText.slice(0, 60)}`,
        });
        if (eventId) void fanOutDeliveries(eventId, recipients);
      }
    }

    // Voyager has stepped out → no AI turn (message still saved + delivered).
    // EXCEPT an `@voyager` aside, which always reaches your private co-pilot.
    if (!room.aiPresent && !voyagerAside) {
      return createUIMessageStreamResponse({
        stream: createUIMessageStream({ execute: async () => {} }),
      });
    }

    // Create Voyager tools
    const { tools: voyagerTools, registrations } = createVoyagerTools({
      userId,
      voyageSlug,
      conversationId,
      waitUntil,
      messages: windowedSimpleMessages,
    });

    // Compose tool strategy section for system prompt
    const toolStrategy = composeToolStrategy(registrations);

    // Compose system prompt with preferences and pinned knowledge
    // Falls back to base prompt if composition fails
    let staticPrefix: string;
    let dynamicSuffix: string = '';
    let retrievedKnowledge: KnowledgeNode[] = [];
    let retrievalEventId: string | null = null;

    try {
      const { staticPrompt, dynamicPrompt, retrieval } = await composeSystemPrompt(
        userId,
        {
          profile: { id: userId, displayName },
          voyageSlug,
          sessionId: conversationId,
          continuityContext,
          authState,
        }
      );
      // Static prefix: core identity + preferences + pinned + tool strategy (cacheable)
      staticPrefix = staticPrompt + '\n\n' + toolStrategy;
      // Dynamic suffix: auth state, continuity context (per-turn, not cached)
      dynamicSuffix = dynamicPrompt;
      retrievedKnowledge = retrieval.knowledge;

      // Log retrieval event (fire-and-forget)
      logRetrievalEvent({
        userId: userId,
        conversationId,
        query: queryText,
        nodesReturned: retrieval.knowledge,
        threshold: retrieval.metadata.threshold,
        pinnedCount: retrieval.metadata.pinnedCount,
        searchCount: retrieval.metadata.searchCount,
        latencyMs: retrieval.metadata.latencyMs,
        tokensInContext: retrieval.tokenEstimate,
      }).then((id) => {
        retrievalEventId = id;
      });
    } catch (error) {
      log.api('Prompt composition failed, using base prompt', { error: String(error) }, 'warn');
      staticPrefix = getBasePrompt() + '\n\n' + toolStrategy;
    }

    // Shell Contract: inject intent guidance into dynamic (uncached) prompt
    if (intent) {
      if (intent.verb === 'switch' && !intent.target) {
        dynamicSuffix += `\n[Shell: intent detected — switch. No target specified. Help the user choose a voyage.]`;
      } else if (intent.verb === 'do' && intent.payload) {
        dynamicSuffix += `\n[Shell: intent detected — do. Payload: "${intent.payload}". Determine which action tool applies.]`;
      } else {
        const target = intent.target ? ` ${intent.target}` : '';
        dynamicSuffix += `\n[Shell: intent detected — ${intent.verb}${target}. Ensure the corresponding tool is called.]`;
      }
    }

    // Build messages array with cache control for prompt caching
    const cacheControl = { anthropic: { cacheControl: { type: 'ephemeral' as const } } };

    const systemMessages = [
      {
        role: 'system' as const,
        content: staticPrefix,
        providerOptions: cacheControl,
      },
      // Dynamic suffix as separate system message if present (not cached)
      ...(dynamicSuffix
        ? [{ role: 'system' as const, content: dynamicSuffix }]
        : []),
    ];

    // Add cache control to last user message (caches conversation prefix)
    const messagesWithCache = windowedSimpleMessages.map((m, i) => ({
      ...m,
      ...(i === windowedSimpleMessages.length - 1
        ? { providerOptions: cacheControl }
        : {}),
    }));

    // Signal detection: dispatch retrieval agent in parallel with LLM response
    if (retrievalSignals.length > 0 && intent?.verb !== 'find') {
      waitUntil(
        dispatchRetrievalAgent(retrievalSignals, queryText, {
          userId,
          voyageSlug,
          conversationId,
          waitUntil,
          messages: windowedSimpleMessages,
        })
      );
    }

    // Resolve the model for THIS user: their brain connection (subscription)
    // if connected, else the default provider. Nothing else about the turn changes.
    const { model: chatModel, label: chatModelLabel } = await resolveUserModelWithMeta(
      { task: 'chat', quality: 'balanced', streaming: true, toolUse: true },
      userId,
    );

    // Primary Voyager with tools
    // Voyager decides when to use tools and self-terminates when done
    const result = streamText({
      model: chatModel,
      messages: [...systemMessages, ...messagesWithCache],
      tools: voyagerTools,
      maxOutputTokens: 4096,
      stopWhen: [
        stepCountIs(15),                        // hard cost cap
        hasToolCall('spawn_background_agent'),   // offloaded to background
      ],
      onFinish: async ({ text, steps, finishReason, usage, providerMetadata }) => {
        // Shell Contract: reconcile detected intent against actual tool calls
        if (intent) {
          const allToolCalls = steps.flatMap(step => step.toolCalls);
          waitUntil(
            reconcileActions(
              intent,
              allToolCalls.map(tc => ({ toolName: tc.toolName })),
              text ?? '',
              { userId, voyageSlug, conversationId, waitUntil, messages: windowedSimpleMessages },
            ).catch(err => log.api('Shell reconciliation error', { error: String(err) }, 'error'))
          );
        }

        // Extract cache metrics from Anthropic provider
        const cacheCreationTokens = (providerMetadata?.anthropic?.cacheCreationInputTokens as number) ?? 0;
        const cacheReadTokens = (providerMetadata?.anthropic?.cacheReadInputTokens as number) ?? 0;

        log.message('Stream complete', {
          textLength: text?.length ?? 0,
          finishReason,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          cacheCreationTokens,
          cacheReadTokens,
        });

        // Track credits with cache metrics
        if (usage) {
          const inputTokens = usage.inputTokens ?? 0;
          const outputTokens = usage.outputTokens ?? 0;
          // Subscription compute (chatModelLabel !== 'claude-sonnet') has no
          // per-token API cost — record usage, but cost 0.
          const onDefaultProvider = chatModelLabel === 'claude-sonnet';
          creditTracker.track({
            userId,
            model: chatModelLabel,
            inputTokens,
            outputTokens,
            cacheCreationTokens,
            cacheReadTokens,
            cost: onDefaultProvider
              ? modelRouter.estimateCost('claude-sonnet', inputTokens, outputTokens)
              : 0,
            task: 'chat',
            conversationId,
          });
        }

        // Save assistant response after streaming completes
        if (conversationId && text) {
          try {
            await saveMessage(conversationId, 'assistant', text);

            // Await knowledge event creation (must complete before count check)
            await createMessageEvent(conversationId, 'assistant', text, {
              userId: userId,
              voyageSlug: voyageSlug,
              participants: [userId],
              eventType: 'conversation',
            });

            // Log citations (fire-and-forget)
            // Detects which retrieved nodes were actually used in the response
            logCitations(retrievalEventId, text, retrievedKnowledge);

            // Count-based enrichment trigger: check unenriched events for this session
            const shouldEnrich = await shouldRunEnrichment(conversationId);
            if (shouldEnrich) {
              waitUntil(
                runCartographer({
                  sessionId: conversationId,
                  userId,
                  voyageSlug,
                })
              );
            }
          } catch (error) {
            console.error('[Chat] Failed to save assistant message:', error);
          }
        }

      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    // Handle rate limits and API errors
    if (error instanceof APICallError) {
      const status = error.statusCode ?? 500;

      if (status === 429) {
        return new Response(
          JSON.stringify({
            error: 'Rate limited',
            message: 'Too many requests. Please try again in a moment.'
          }),
          {
            status: 429,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (status === 401) {
        return new Response(
          JSON.stringify({
            error: 'Authentication error',
            message: 'Invalid API key'
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      return new Response(
        JSON.stringify({
          error: 'API error',
          message: error.message
        }),
        {
          status,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request',
          message: 'Invalid JSON in request body'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Generic error fallback
    log.api('Chat API error', { error: String(error) }, 'error');
    return new Response(
      JSON.stringify({
        error: 'Internal error',
        message: 'An unexpected error occurred'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
