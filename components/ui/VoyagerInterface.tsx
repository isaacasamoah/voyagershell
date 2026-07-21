"use client";

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import type { UIMessage } from 'ai';
import { Terminal, Ship, LogOut } from 'lucide-react';
import { UserMessage, AssistantMessage, AstronautState, TaskCard, HumanMessage, InviteKnock, SystemLine, type TaskProgress } from '@/components/chat';
import type { MessagePart } from '@/components/chat/AssistantMessage';
import { useAuth } from '@/lib/auth/context';
import { getSuggestions, getWelcomeSuggestion, type SuggestionContext } from '@/lib/ui/suggestions';
import { useRealtimeSubscription } from './hooks/useRealtimeSubscription';
import { useConversation } from './hooks/useConversation';
import { useVoyageContext } from './hooks/useVoyageContext';
import { useAstronautState } from './hooks/useAstronautState';
import { useEventFeed } from '@/lib/messaging/useEventFeed';
import { shouldShowStreamingReply, shouldShowOptimisticUser, countAssistantEvents, type FeedEvent, type StreamingReply, isHydratedMessage } from '@/lib/messaging/feed-types';
import { composerAsideBadge } from '@/lib/messaging/address';
import { useVisualViewport } from './hooks/useVisualViewport';
import { InputArea } from './InputArea';
import { AskCaptainRenderer } from './AskCaptainRenderer';
import { VoyagerWordmark } from './VoyagerWordmark';

// Running task from background worker (in-progress) — stays here, imports TaskProgress from same barrel
interface RunningTask {
  id: string;
  task: string;
  progress?: TaskProgress;
}

interface VoyagerInterfaceProps {
  className?: string;
}

export const VoyagerInterface = ({ className }: VoyagerInterfaceProps) => {
  const streamRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');

  // Brain connection: null = still checking, false = none resolves (own or
  // household) → surface the quiet /connect pointer.
  const [hasBrain, setHasBrain] = useState<boolean | null>(null);

  // Auth state
  const { isAuthenticated, isLoading: isAuthLoading, sendMagicLink, signOut, user } = useAuth();

  // Auth state tracking for system prompt injection
  const [authState, setAuthState] = useState<'unauthenticated' | 'authenticated' | 'just-authenticated'>('unauthenticated');

  // Check brain connection once authenticated (covers own + household resolution)
  useEffect(() => {
    if (!isAuthenticated) {
      setHasBrain(null);
      return;
    }
    let cancelled = false;
    fetch('/api/connections/codex')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setHasBrain(Boolean(d?.connected));
      })
      .catch(() => {
        if (!cancelled) setHasBrain(null); // unknown ≠ disconnected — stay quiet
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Mobile composing mode: keyboard up on a phone → the astronaut steps
  // aside (corner dock) and the input deck rides the keyboard.
  const { height: shellHeight, offsetTop: shellTop, composing } = useVisualViewport();

  // Voyage context (fetch voyages, pending invites, URL params)
  const { currentVoyage, voyageResolved, setCurrentVoyage, voyages, displayName, ownVoyagerHandle, refetchVoyages } = useVoyageContext({
    isAuthenticated,
    isAuthLoading,
  });

  // Composer badge (C5): typing `@<own-handle>` surfaces "→ private aside to
  // <Name>" from the SAME resolver the server uses, so the @-inversion is
  // visible before you send. Empty room set client-side → @another's-voyager
  // shows no private-aside badge (redirect, not aside).
  const asideBadge = useMemo(
    () => composerAsideBadge(inputValue, {
      ownVoyagerHandle,
      ownVoyagerAliases: ['voyager'],
      roomVoyagerHandles: [],
    }),
    [inputValue, ownVoyagerHandle],
  );

  // Conversation (transport, useChat, fetch, welcome, title sync, message queue)
  const {
    conversationId, room, conversationTitle, isLoadingConversation,
    messages, sendMessage, setMessages, status, error,
    hasUserTyped, setHasUserTyped,
    messageQueue, setMessageQueue,
    isLoading, isStreaming,
    showSuccess, setShowSuccess,
    startNewConversation, resumeConversation,
  } = useConversation({
    currentVoyage,
    voyageResolved,
    authState,
    isAuthenticated,
    isAuthLoading,
  });
  const feedUserId = isAuthenticated ? (user?.id ?? null) : null;
  const { events: feedEvents, markSeen: markFeedSeen } = useEventFeed({
    conversationId,
    userId: feedUserId,
  });
  const [streamingReply, setStreamingReply] = useState<StreamingReply | null>(null);
  // Latest feed events, read at turn-start to snapshot the assistant count
  // without re-running the streaming effect on every feed change.
  const feedEventsRef = useRef(feedEvents);
  useEffect(() => { feedEventsRef.current = feedEvents; }, [feedEvents]);

  useEffect(() => {
    if (feedEvents.length > 0) setHasUserTyped(true);
  }, [feedEvents.length, setHasUserTyped]);

  // Astronaut state machine (pure derivation from conversation + auth state)
  const { astronautState, astronautSize, astronautBeat, progressLabel } = useAstronautState({
    messages,
    status,
    error,
    showSuccess,
    isLoading,
    isAuthLoading,
    isLoadingConversation,
    hasUserTyped,
  });

  // Background agent state (running tasks)
  const [runningTasks, setRunningTasks] = useState<RunningTask[]>([]);

  // Detect when user just logged in (after magic link) — celebrate + set auth state
  const wasAuthenticatedRef = useRef(isAuthenticated);
  useEffect(() => {
    if (isAuthLoading) return;

    if (isAuthenticated && !wasAuthenticatedRef.current) {
      setAuthState('just-authenticated');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
      setTimeout(() => setAuthState('authenticated'), 3000);
    } else if (isAuthenticated) {
      setAuthState('authenticated');
    } else {
      setAuthState('unauthenticated');
    }

    wasAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated, isAuthLoading, setShowSuccess]);

  // Realtime subscription for background agent tasks
  const realtimeCallbacks = useMemo(() => ({
    onTaskInsert: (task: { id: string; task: string; progress?: TaskProgress }) => {
      setRunningTasks((prev) => [...prev, task]);
    },
    onTaskUpdate: (taskId: string, taskStatus: string, data: Record<string, unknown>) => {
      if (taskStatus === 'running') {
        setRunningTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, progress: data.progress as TaskProgress | undefined }
              : t
          )
        );
      } else if (taskStatus === 'failed') {
        setRunningTasks((prev) => prev.filter((t) => t.id !== taskId));
      }
    },
    onTaskComplete: (taskId: string) => {
      setRunningTasks((prev) => prev.filter((t) => t.id !== taskId));
    },
  }), []);

  useRealtimeSubscription(conversationId, isAuthenticated, realtimeCallbacks);

  // Clear agent state when conversation changes
  useEffect(() => {
    setRunningTasks([]);
  }, [conversationId]);

  // Detect sign_out tool call — fire signOut() after Voyager's farewell streams
  useEffect(() => {
    if (status !== 'ready' || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'assistant' || !Array.isArray(lastMsg.parts)) return;

    const hasSignOut = lastMsg.parts.some((p) => {
      const part = p as Record<string, unknown>;
      if (part.type === 'tool-sign_out') return true;
      if (part.type === 'dynamic-tool' && part.toolName === 'sign_out') return true;
      return false;
    });

    if (hasSignOut) {
      const timer = setTimeout(() => signOut(), 1500);
      return () => clearTimeout(timer);
    }
  }, [status, messages, signOut]);

  // Keep the newest message in view. The stream is the ONLY scroll container,
  // so this is a single line — no page scroll, no dual anchors. Re-runs when
  // the keyboard toggles (shell resizes) so nothing hides behind the input.
  const feedEventCount = feedEvents.length;
  const streamingReplyId = streamingReply?.id ?? null;
  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    // shellHeight in deps: the keyboard shrinks the stream in several frames
    // after composing flips — re-anchor on each so the newest line never
    // slips below the fold (codex review).
  }, [feedEventCount, streamingReplyId, composing, shellHeight]);

  // All messages go to Voyager — no intent detection, no slash commands, no auth gate
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    setHasUserTyped(true);
    if (!isAuthenticated) {
      setMessages((prev) => [
        ...prev,
        {
          id: `preview-auth-${Date.now()}`,
          role: 'assistant',
          parts: [{ type: 'text', text: 'sign in to send live messages from VoyagerShell.' }],
        } as UIMessage,
      ]);
      setInputValue('');
      return;
    }

    if (isLoading) {
      setMessageQueue(prev => [...prev, trimmed]);
    } else {
      sendMessage({ text: trimmed });
    }
    setInputValue('');
  };

  const handleSuggestionClick = (action: string) => {
    setInputValue(action);
  };

  // Apply a voyage switch to client state + URL. Invoked by the conversational
  // switch path (switch_voyage tool result) and ask_captain picker — never by
  // header chrome; the $VOY chip is a read-only indicator.
  const handleVoyageSwitch = useCallback((slug: string | null) => {
    if (slug === null) {
      setCurrentVoyage(null);
      window.history.replaceState({}, '', window.location.pathname);
    } else {
      const voyage = voyages.find(v => v.slug === slug);
      if (voyage) {
        setCurrentVoyage(voyage);
        window.history.replaceState({}, '', `?voyage=${slug}`);
      }
    }
  }, [voyages, setCurrentVoyage]);

  // Detect switch_voyage tool call — update voyage context from tool result
  useEffect(() => {
    if (status !== 'ready' || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'assistant' || !Array.isArray(lastMsg.parts)) return;

    for (const p of lastMsg.parts) {
      const part = p as Record<string, unknown>;
      const isSwitchVoyage = part.type === 'tool-switch_voyage' ||
        (part.type === 'dynamic-tool' && part.toolName === 'switch_voyage');
      // AI SDK uses state: 'output-available' (not 'result') and stores the
      // tool result in `output` (not `result`).
      if (!isSwitchVoyage || part.state !== 'output-available') continue;

      try {
        const output = typeof part.output === 'string' ? JSON.parse(part.output as string) : part.output;
        if ((output as Record<string, unknown>)?.switched) {
          // Accept both new canonical `voyageSlug` field and legacy `slug` field
          // (legacy for stale message history from prior server responses)
          const o = output as Record<string, unknown>;
          const slug = o.voyageSlug !== undefined ? o.voyageSlug : o.slug;
          handleVoyageSwitch(slug as string | null);
        }
      } catch { /* ignore parse errors */ }
    }
  }, [status, messages, handleVoyageSwitch]);

  // Detect create_voyage tool call success — refetch voyages so the new voyage
  // appears in the picker immediately without a page reload (ORU-256).
  useEffect(() => {
    if (status !== 'ready' || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'assistant' || !Array.isArray(lastMsg.parts)) return;

    for (const p of lastMsg.parts) {
      const part = p as Record<string, unknown>;
      const isCreateVoyage = part.type === 'tool-create_voyage' ||
        (part.type === 'dynamic-tool' && part.toolName === 'create_voyage');
      // AI SDK uses state: 'output-available' (not 'result') and stores the
      // tool result in `output` (not `result`).
      if (!isCreateVoyage || part.state !== 'output-available') continue;

      try {
        const output = typeof part.output === 'string' ? JSON.parse(part.output as string) : part.output;
        if (output?.created) {
          refetchVoyages();
        }
      } catch { /* ignore parse errors */ }
    }
  }, [status, messages, refetchVoyages]);

  // Send a message as the user (used by ask_captain components)
  const sendUserMessage = useCallback((text: string) => {
    setHasUserTyped(true);
    if (isLoading) {
      setMessageQueue(prev => [...prev, text]);
    } else {
      sendMessage({ text });
    }
  }, [isLoading, sendMessage, setHasUserTyped, setMessageQueue]);

  // Helper to extract text content from UIMessage
  const getMessageText = useCallback((message: UIMessage): string => {
    if (Array.isArray(message.parts)) {
      return message.parts
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map(part => part.text)
        .join('');
    }
    return '';
  }, []);

  // Helper to extract ask_captain tool call parts from a UIMessage
  const getAskCaptainParts = useCallback((message: UIMessage): Array<{
    toolCallId: string
    state: string
    input: unknown
    result: unknown
  }> => {
    if (!Array.isArray(message.parts)) return [];
    const results: Array<{ toolCallId: string; state: string; input: unknown; result: unknown }> = [];
    for (const part of message.parts) {
      const p = part as Record<string, unknown>;
      const isAskCaptain = p.type === 'tool-ask_captain' ||
        (p.type === 'dynamic-tool' && p.toolName === 'ask_captain');
      if (isAskCaptain) {
        results.push({
          toolCallId: p.toolCallId as string,
          state: p.state as string,
          input: p.input,
          result: p.result,
        });
      }
    }
    return results;
  }, []);

  // Compute context-aware suggestions
  const suggestionContext: SuggestionContext = useMemo(() => ({
    isAuthenticated,
    hasVoyages: voyages.length > 0,
    currentVoyage: currentVoyage?.slug,
    hasRecentConversations: false,
    lastMessageRole: messages.length > 0 ? messages[messages.length - 1]?.role : undefined,
    conversationLength: messages.length,
    isLoading,
  }), [isAuthenticated, voyages.length, currentVoyage?.slug, messages, isLoading]);

  const suggestions = useMemo(() => getSuggestions(suggestionContext), [suggestionContext]);
  const welcomeHint = useMemo(() => getWelcomeSuggestion(suggestionContext), [suggestionContext]);

  // Handler for component actions in the stream
  const handleComponentAction = useCallback((action: string, data?: unknown) => {
    if (action === 'voyage_select' && typeof data === 'string') {
      if (conversationId && !isLoading) {
        sendMessage({ text: `switch to ${data}` });
      }
    }
  }, [conversationId, isLoading, sendMessage]);

  useEffect(() => {
    const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant' && !isHydratedMessage(message));
    if (!lastAssistant) return;

    const content = getMessageText(lastAssistant);
    const hasCaptainParts = getAskCaptainParts(lastAssistant).length > 0;
    if (!content && !hasCaptainParts) return;
    if (!isStreaming && streamingReply?.id !== lastAssistant.id) return;

    setStreamingReply((prev) => {
      // useChat returns a NEW `messages` array reference every render, so this
      // effect runs every render. When the transient's guard is open (same id),
      // building a fresh object each render re-renders → this effect runs again
      // → Maximum update depth (#185). Return the SAME object when content is
      // unchanged so React bails and the loop can't sustain. (Surfaces in the
      // aside→room race, where the transient lingers with the guard open.)
      if (prev?.id === lastAssistant.id) {
        return prev.content === content ? prev : { ...prev, content };
      }
      return {
        id: lastAssistant.id,
        content,
        startedAt: new Date().toISOString(),
        // Snapshot the assistant-event count at turn start; the transient
        // clears once the feed holds one more (this turn's own reply).
        settledCount: countAssistantEvents(feedEventsRef.current),
      };
    });
  }, [getAskCaptainParts, getMessageText, isStreaming, messages, streamingReply?.id]);

  useEffect(() => {
    if (!streamingReply) return;
    if (!shouldShowStreamingReply(streamingReply, feedEvents)) setStreamingReply(null);
  }, [feedEvents, streamingReply]);

  useEffect(() => {
    setStreamingReply(null);
  }, [conversationId]);

  const formatEventTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const buildAssistantParts = useCallback((message: UIMessage, content: string): MessagePart[] | null => {
    const captainParts = getAskCaptainParts(message);
    if (captainParts.length === 0) return null;

    const messageParts: MessagePart[] = [];
    if (content) {
      messageParts.push({ type: 'text', text: content });
    }

    for (const captainPart of captainParts) {
      messageParts.push({
        type: 'react',
        element: (
          <AskCaptainRenderer
            key={captainPart.toolCallId}
            input={captainPart.input as Parameters<typeof AskCaptainRenderer>[0]['input']}
            toolState={captainPart.state}
            toolResult={captainPart.result}
            toolCallId={captainPart.toolCallId}
            sendMagicLink={sendMagicLink}
            onSendMessage={sendUserMessage}
            onVoyageSwitch={handleVoyageSwitch}
            onNewConversation={startNewConversation}
            onResumeConversation={resumeConversation}
          />
        ),
      });
    }

    return messageParts;
  }, [
    getAskCaptainParts,
    handleVoyageSwitch,
    resumeConversation,
    sendMagicLink,
    sendUserMessage,
    startNewConversation,
  ]);

  const renderFeedEvent = (event: FeedEvent) => {
    if (event.kind === 'system') {
      return (
        <SystemLine
          key={event.id}
          content={event.content}
          onSeen={event.deliveryId && !event.seen ? () => markFeedSeen(event.deliveryId as string) : undefined}
        />
      );
    }

    if (event.kind === 'invite') {
      return (
        <InviteKnock
          key={event.id}
          content={event.content}
          senderName={event.senderDisplayName ?? 'someone'}
          timestamp={event.createdAt}
          inviteState={event.inviteState}
          conversationId={conversationId}
        />
      );
    }

    if (event.role === 'human') {
      return (
        <HumanMessage
          key={event.id}
          senderName={event.senderDisplayName ?? 'someone'}
          content={event.content}
          timestamp={event.createdAt}
          onSeen={event.deliveryId && !event.seen ? () => markFeedSeen(event.deliveryId as string) : undefined}
        />
      );
    }

    const timestamp = formatEventTime(event.createdAt);
    if (event.role === 'user') {
      return (
        <UserMessage
          key={event.id}
          content={event.content}
          timestamp={timestamp}
          username="you"
          isAside={event.isAside}
        />
      );
    }

    return (
      <AssistantMessage
        key={event.id}
        content={event.content}
        timestamp={timestamp}
        voyagerName={event.senderDisplayName}
        ownerName={event.ownerName}
        isAside={event.isAside}
      />
    );
  };

  // The user's just-sent message, shown live until its 'conversation' event
  // lands in the feed — so it never vanishes during the send round-trip.
  const renderOptimisticUser = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user' && !isHydratedMessage(m));
    if (!lastUser) return null;
    const content = getMessageText(lastUser);
    if (!shouldShowOptimisticUser(content, feedEvents, ownVoyagerHandle)) return null;
    return <UserMessage key={`optimistic-${lastUser.id}`} content={content} timestamp="LIVE" username="you" />;
  };

  const renderStreamingReply = () => {
    if (!shouldShowStreamingReply(streamingReply, feedEvents)) return null;
    const streamingMessage = messages.find((message) => message.id === streamingReply.id);
    const content = streamingMessage ? getMessageText(streamingMessage) : streamingReply.content;
    const parts = streamingMessage ? buildAssistantParts(streamingMessage, content) : null;

    return (
      <AssistantMessage
        key={`streaming-${streamingReply.id}`}
        content={parts ? undefined : content}
        parts={parts ?? undefined}
        timestamp="LIVE"
        isStreaming={isStreaming}
        onAction={handleComponentAction}
      />
    );
  };

  const errorText = (() => {
    const raw = error?.message?.trim() ?? '';
    // Never surface raw JSON payloads (e.g. session_access_denied) — kind line.
    if (raw.startsWith('{')) return "that one didn't get through. try again?";
    return raw || "that one didn't get through. try again?";
  })();

  return (
    <div
      className={`fixed top-0 left-0 right-0 h-[100svh] flex flex-col overflow-hidden bg-[#050505] text-slate-300 font-mono text-sm selection:bg-indigo-500/30 ${className || ''}`}
      style={{ height: shellHeight ? `${shellHeight}px` : undefined, top: shellTop ? `${shellTop}px` : undefined }}
    >

      {/* HEADER — flex-none top row of the shell. No position:fixed, so it
          cannot drift; only present once the conversation has started. */}
      {hasUserTyped && (
      <header className="flex-none relative bg-[#050505] px-4 h-[52px] flex items-center justify-between overflow-hidden">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-2 text-indigo-400 shrink-0">
            <Terminal size={16} />
            <VoyagerWordmark variant="dock" shell={hasUserTyped} />
          </div>

          {/* Context Chips - only show when authenticated */}
          {isAuthenticated && (
            <>
              <div className="h-4 w-[1px] bg-white/10 mx-1"></div>

              <div className="flex gap-2 overflow-hidden min-w-0">
                {/* Voyage context chip — READ-ONLY indicator. Switching is
                    conversational only (switch verb → tool → handshake). */}
                <div className="relative shrink-0">
                  {currentVoyage ? (
                    <div className="px-2 py-1 rounded-sm border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs flex items-center gap-2 shadow-[0_0_10px_rgba(168,85,247,0.1)] min-w-0">
                      <Ship size={10} className="shrink-0" />
                      <span className="opacity-30 font-semibold shrink-0">$VOY:</span>
                      <span className="truncate max-w-[120px]">{currentVoyage.name.toUpperCase().replace(/\s+/g, '_')}</span>
                    </div>
                  ) : (
                    <div className="px-2 py-1 rounded-sm border border-slate-700 bg-slate-800/50 text-slate-400 text-xs flex items-center gap-2">
                      <Ship size={10} className="shrink-0" />
                      <span className="opacity-30 font-semibold">$VOY:</span> PERSONAL
                    </div>
                  )}

                </div>
                {/* Conversation context chip — server-confirmed title only, never echoes user input */}
                <div className="px-2 py-1 rounded-sm border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs flex items-center gap-2 min-w-0">
                  <span className="opacity-30 font-semibold shrink-0">$CTX:</span>
                  <span className="truncate">{conversationTitle || 'NEW_SESSION'}</span>
                </div>
                {/* Room chip — who's in the room + whether Voyager is present.
                    Honest indicator: you always know where your words go. */}
                {room.people.length > 0 && (
                  <div className="px-2 py-1 rounded-sm border border-[#f7a34b]/30 bg-[#f7a34b]/10 text-[#f7a34b] text-xs flex items-center gap-2 min-w-0 shrink-0">
                    <span className="opacity-40 font-semibold shrink-0">WITH:</span>
                    <span className="truncate max-w-[140px]">
                      {room.people.map((p) => p.toUpperCase().replace(/\s+/g, '_')).join(', ')}
                      {!room.aiPresent && ' · 🧠⬜'}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right chrome — identity + the sign-out affordance. Sign-out is a
            real control wired straight to signOut(); auth intent never has to
            pass through the composer to happen (ORU-449 W2 · C2). */}
        <div className="flex items-center gap-3 shrink-0">
          {displayName && (
            <div className="hidden sm:block text-[10px] text-slate-500 font-mono tracking-widest uppercase">
              {displayName.toUpperCase().replace(/\s+/g, '_')}
            </div>
          )}
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => signOut()}
              title="Sign out"
              aria-label="Sign out"
              className="flex items-center gap-1 px-2 py-1 rounded-sm border border-white/10 text-slate-500 hover:text-[#ff5f56] hover:border-[#ff5f56]/40 text-[10px] font-mono tracking-widest uppercase transition-colors"
            >
              <LogOut size={12} className="shrink-0" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-[#ff5f56]/30 via-[#5ec98f]/30 to-[#b07af5]/30" />
      </header>
      )}

      {/* STREAM — the ONLY scroll container in the app. flex-1 fills the space
          between header and input; the astronaut lives at the top of it. */}
      <div ref={streamRef} className="flex-1 overflow-y-auto overscroll-contain">
        <div className={`max-w-2xl mx-auto px-4 ${hasUserTyped ? 'py-8' : 'min-h-full flex flex-col justify-center'}`}>

          {/* ASTRONAUT — the hero when untouched; a quiet band at the top of
              the conversation once talking; absent while composing on mobile.
              It's ordinary content in the scroll, so it just scrolls away. */}
          {(!hasUserTyped || !composing) && (
            <div className={`flex flex-col items-center pointer-events-none ${hasUserTyped ? 'mb-12' : ''}`}>
              {!hasUserTyped && (
                <VoyagerWordmark variant="hero" className="-mb-12 scale-[0.74] sm:-mb-32 sm:scale-90" />
              )}
              <div className={!hasUserTyped ? 'scale-[0.62] sm:scale-100' : 'scale-[0.5] sm:scale-75'}>
                <AstronautState state={astronautState} beat={astronautBeat} size={astronautSize} />
              </div>
              {!hasUserTyped && (
                <p className="mt-1 sm:mt-5 text-center text-[11px] sm:text-xs tracking-[0.24em] sm:tracking-[0.5em] text-transparent bg-clip-text bg-gradient-to-r from-[#f7a34b] via-[#f4e04d] to-[#59a5ff] opacity-60">
                  let&apos;s go together
                </p>
              )}
              {progressLabel && isStreaming && (
                <div className="text-center text-xs text-slate-500 mt-2 animate-pulse">
                  {progressLabel}
                </div>
              )}
            </div>
          )}

          <div className="space-y-12">

        {/* One ordered event stream from /api/feed; useChat is only the live transient. */}
        {feedEvents.map(renderFeedEvent)}
        {renderOptimisticUser()}
        {/* Queued messages are real user intent — show them, never swallow them.
            (Honest indicator: typed text must stay visible until it truly lands.) */}
        {messageQueue.map((queued, i) => (
          <UserMessage key={`queued-${i}`} content={queued} timestamp="QUEUED" username="you" />
        ))}
        {renderStreamingReply()}

        {/* Error state */}
        {error && (
          <div className="flex gap-4">
            <div className="w-12 pt-1 text-right text-[#ff5f56]/60 text-[10px] font-bold tracking-widest">
              ERR
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[#ffb0aa] text-sm p-3 border border-[#ff5f56]/35 bg-[#ff5f56]/10 rounded-sm shadow-[0_0_18px_rgba(255,95,86,0.08)] break-words">
                {errorText}
              </div>
            </div>
          </div>
        )}


        {/* Running Tasks - Show progress */}
        {runningTasks.length > 0 && (
          <div className="space-y-3 max-w-2xl mx-auto py-4">
            {runningTasks.map((task) => (
              <TaskCard
                key={task.id}
                id={task.id}
                objective={task.task}
                progress={task.progress}
              />
            ))}
          </div>
        )}

        </div>{/* end space-y-12 */}
        </div>{/* end max-w content */}
      </div>{/* end STREAM scroll container */}

      {/* INPUT — flex-none bottom row. The shell shrinks with the keyboard,
          so this sits right on it with no transform. */}
      <footer className="flex-none bg-[#050505] border-t border-white/10 p-4 pb-6">
        <div className="max-w-2xl mx-auto">
          {/* No brain connected — quiet honest pointer, not a wall */}
          {isAuthenticated && hasBrain === false && (
            <div className="mb-3 text-xs text-slate-500">
              no brain connected —{' '}
              <a href="/connect" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4 transition">
                connect your ChatGPT subscription
              </a>{' '}
              to start chatting
            </div>
          )}

          {/* Context-Aware Suggestions */}
          {suggestions.length > 0 && (
            <div className="flex gap-3 mb-3 overflow-x-auto pb-1 scrollbar-hide">
              {suggestions.map(suggestion => (
                <button
                  key={suggestion.id}
                  type="button"
                  onClick={() => handleSuggestionClick(suggestion.action)}
                  className="text-xs text-slate-400 hover:text-slate-100 transition-colors whitespace-nowrap rounded-sm border border-white/10 hover:border-[#b07af5]/40 bg-white/[0.025] px-2 py-1"
                >
                  {suggestion.text}
                </button>
              ))}
            </div>
          )}

          {/* Welcome hint for empty states */}
          {welcomeHint && messages.length === 0 && (
            <div className="text-xs text-slate-600 mb-3 italic">
              {welcomeHint}
            </div>
          )}

          {asideBadge && (
            <div className="text-[#5ec98f] text-xs font-mono mb-1 pl-8 animate-pulse">
              {asideBadge}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <InputArea
              value={inputValue}
              onChange={setInputValue}
              onSubmit={() => {
                const form = document.querySelector('form');
                if (form) form.requestSubmit();
              }}
              isLoading={isLoading}
              queueCount={messageQueue.length}
            />
          </form>
        </div>
      </footer>
    </div>
  );
};
