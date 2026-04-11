import { streamText, stepCountIs, hasToolCall, APICallError } from 'ai';
import { waitUntil } from '@vercel/functions';
import { composeSystemPrompt, getBasePrompt } from '@/lib/prompts';
import {
  saveMessage,
  getBranchContext,
  routeBranchMessage,
  type ConversationMessage,
  type BranchContext,
} from '@/lib/conversation';
import { computeWindow, getTruncatedMessages } from '@/lib/conversation/window';
import {
  detectReferenceSignals,
  retrieveForContinuity,
} from '@/lib/conversation/continuity';
import { detectLearningSignal, emitSignal } from '@/lib/learning/signals';
import { emitMessageEvent, createMessageEvent, type KnowledgeNode, type AwarenessItem } from '@/lib/knowledge';
import { logRetrievalEvent, logCitations, createVoyagerTools, composeToolStrategy } from '@/lib/retrieval';
import { CORE_TOOL_NAMES } from '@/lib/retrieval/tools';
import { loadModuleTools } from '@/lib/modules';
import { requireAuthResponse } from '@/lib/auth';
import { shouldRunEnrichment, runCartographer } from '@/lib/agents/cartographer';
import { modelRouter, creditTracker } from '@/lib/models';
import { resolveApiKey, NO_KEY_ERROR } from '@/lib/keys';
import { updateLastSeen, markDelivered } from '@/lib/voyage';
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

  try {
    // Require authentication
    const authResult = await requireAuthResponse();
    if (authResult instanceof Response) return authResult;
    const userId = authResult;

    const { messages, conversationId, voyageSlug: requestedVoyageSlug, authState } = await req.json();

    // No voyage context = personal space (voyage_id NULL is valid)
    const voyageSlug: string | undefined = requestedVoyageSlug || undefined;

    // Resolve the user's BYO conversation key. No server env fallback.
    const resolvedKey = await resolveApiKey(userId, 'conversation', {
      voyageSlug,
    });
    if (!resolvedKey) {
      return new Response(
        JSON.stringify({
          error: 'No API key configured',
          message: NO_KEY_ERROR,
          code: 'NO_API_KEY',
        }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      );
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
    const queryText = lastUserMessage?.content ?? '';

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

    // Save user message to DB (fire-and-forget, don't block streaming)
    if (conversationId && queryText) {
      saveMessage(conversationId, 'user', queryText).catch((error) => {
        console.error('[Chat] Failed to save user message:', error);
      });

      // Emit knowledge event (fire-and-forget)
      // Conversation turns → eventType 'conversation' (Cartographer enriches these)
      // Inter-user messages via resolve_mention → eventType 'message' (skip Cartographer)
      emitMessageEvent(conversationId, 'user', queryText, {
        userId: userId,
        voyageSlug: voyageSlug,
        eventType: 'conversation',
      });
    }

    // =============================================================================
    // SLICE 5: Conversation branch detection
    // =============================================================================
    // If the current session is a branch, load context so we can either (a)
    // short-forward messages to another participant without running the LLM,
    // or (b) inject branch metadata into dynamicSuffix so Voyager knows it is
    // speaking inside a person/channel branch. The non-branch path is
    // unaffected -- getBranchContext returns null and we fall through.
    let branchContext: BranchContext | null = null;
    let branchRoute: 'other_person' | 'private_counsel' | 'channel' | null = null;
    if (conversationId) {
      branchContext = await getBranchContext(conversationId);
      if (branchContext) {
        branchRoute = routeBranchMessage({
          branchSession: branchContext,
          senderUserId: userId,
          content: queryText,
        });
        log.message('Branch context detected', {
          conversationId,
          branchType: branchContext.branchType,
          route: branchRoute,
        });

        // For person-branch forwards, write a participant-scoped knowledge
        // event directly (mirroring resolve_mention's on-the-wire shape) so
        // the peer sees the message via Awareness / get_messages. The LLM
        // turn that follows just acknowledges the forward -- it does NOT
        // author the forwarded content; the user's raw text is the message.
        if (
          branchContext.branchType === 'person' &&
          branchRoute === 'other_person' &&
          branchContext.participantUserIds &&
          queryText
        ) {
          const peerIds = branchContext.participantUserIds.filter(
            (id) => id !== userId
          );
          if (peerIds.length > 0) {
            try {
              // Fetch sender display name for attribution (mirrors
              // resolve_mention's V6 AC 11 path).
              const { getAdminClient: _getAdmin } = await import(
                '@/lib/supabase/admin'
              );
              const _admin = _getAdmin();
              const { data: senderProfile } = await _admin
                .from('profiles')
                .select('display_name, email')
                .eq('id', userId)
                .maybeSingle();
              const senderName =
                (senderProfile as { display_name: string | null; email: string | null } | null)
                  ?.display_name ??
                (senderProfile as { email: string | null } | null)?.email ??
                'Unknown';
              const allParticipants = Array.from(
                new Set([userId, ...peerIds])
              );
              const contextSnippet = `${senderName} (branch): ${queryText.slice(0, 60)}`;
              await createMessageEvent(
                conversationId,
                'user',
                queryText,
                {
                  userId,
                  voyageSlug: branchContext.voyageSlug ?? undefined,
                  participants: allParticipants,
                  addressedTo: peerIds,
                  source: 'branch-forward',
                  senderDisplayName: senderName,
                  senderUserId: userId,
                  attentionScore: 0.85,
                  contextSnippet,
                }
              );
            } catch (forwardError) {
              log.api(
                'Branch forward knowledge event failed',
                { error: String(forwardError) },
                'error'
              );
            }
          }
        }
      }
    }

    // Fetch user profile for display name (prompt composition needs it)
    const { getAdminClient: getAdmin } = await import('@/lib/supabase/admin');
    const adminClient = getAdmin();
    const { data: userProfile } = await adminClient
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle();
    const displayName = (userProfile as { display_name: string | null } | null)?.display_name ?? undefined;

    // Load installed module tools (Slice 2). No-op when user has nothing
    // installed. Happens AFTER the BYO key check so keys gate first.
    const moduleBundle = await loadModuleTools({
      userId,
      voyageSlug,
      conversationId,
      reservedToolNames: CORE_TOOL_NAMES,
    });

    // Create Voyager tools (core + modules)
    const { tools: voyagerTools, registrations } = createVoyagerTools(
      {
        userId,
        voyageSlug,
        conversationId,
        waitUntil,
        messages: windowedSimpleMessages,
      },
      {
        tools: moduleBundle.tools,
        registrations: moduleBundle.registrations,
      }
    );

    // Compose tool strategy section for system prompt -- includes module
    // skill prompts so the model sees per-module guidance alongside tools.
    const toolStrategy = composeToolStrategy(
      registrations,
      moduleBundle.skillPrompts
    );

    // Compose system prompt with preferences and pinned knowledge
    // Falls back to base prompt if composition fails
    let staticPrefix: string;
    let dynamicSuffix: string = '';
    let retrievedKnowledge: KnowledgeNode[] = [];
    let retrievalEventId: string | null = null;
    let loadedAwarenessItems: AwarenessItem[] = [];

    try {
      const { staticPrompt, dynamicPrompt, retrieval, awarenessItems } = await composeSystemPrompt(
        userId,
        {
          profile: { id: userId, displayName },
          voyageSlug,
          sessionId: conversationId,
          continuityContext,
          authState,
        }
      );
      loadedAwarenessItems = awarenessItems;
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

    // Slice 5: inject branch context into the dynamic (uncached) prompt so
    // Voyager knows it is speaking inside a branch. For person-branch
    // forwards we also tell the model to keep its reply to a short
    // acknowledgment -- the actual forwarded content was already written to
    // the knowledge event above.
    if (branchContext) {
      const metaLines: string[] = ['[Slice 5: you are inside a conversation branch.]'];
      if (branchContext.branchType === 'person' && branchContext.participantUserIds) {
        metaLines.push(
          `[Branch type: person. Participants: ${branchContext.participantUserIds.join(', ')}.]`
        );
        if (branchRoute === 'other_person') {
          metaLines.push(
            '[Route: other_person. The user\'s message has already been forwarded to the peer. Respond with a SHORT acknowledgment (e.g. "Sent.") -- do not restate or expand the message.]'
          );
        } else if (branchRoute === 'private_counsel') {
          metaLines.push(
            '[Route: private_counsel. This turn is private counsel between Voyager and the sender about their conversation with the peer; the peer does NOT see your reply. Speak candidly to the sender.]'
          );
        }
      } else if (branchContext.branchType === 'channel' && branchContext.channelName) {
        metaLines.push(
          `[Branch type: channel. Channel: #${branchContext.channelName} (voyage-wide, all members can see).]`
        );
      }
      dynamicSuffix += '\n' + metaLines.join('\n');
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

    // Primary Voyager with tools
    // Voyager decides when to use tools and self-terminates when done
    const selectedChatConfig = modelRouter.selectConfig({
      task: 'chat',
      quality: 'balanced',
      streaming: true,
      toolUse: true,
      resolvedKey,
    });
    const result = streamText({
      model: modelRouter.select({
        task: 'chat',
        quality: 'balanced',
        streaming: true,
        toolUse: true,
        resolvedKey,
      }),
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
          creditTracker.track({
            userId,
            model: selectedChatConfig.id,
            inputTokens,
            outputTokens,
            cacheCreationTokens,
            cacheReadTokens,
            cost: modelRouter.estimateCost(
              selectedChatConfig.id,
              inputTokens,
              outputTokens
            ),
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

        // Mark awareness items as delivered + update last_seen_at (fire-and-forget)
        if (voyageSlug) {
          waitUntil(markDelivered(userId, voyageSlug, loadedAwarenessItems));
          waitUntil(updateLastSeen(userId, voyageSlug)); // backward compat
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
