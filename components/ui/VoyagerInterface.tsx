"use client";

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import type { UIMessage } from 'ai';
import { Terminal, Ship } from 'lucide-react';
import { UserMessage, AssistantMessage, AstronautState, TaskCard, type TaskProgress } from '@/components/chat';
import { useAuth } from '@/lib/auth/context';
import { getSuggestions, getWelcomeSuggestion, type SuggestionContext } from '@/lib/ui/suggestions';
import { useRealtimeSubscription } from './hooks/useRealtimeSubscription';
import { useMessageState } from './hooks/useMessageState';
import { useConversation } from './hooks/useConversation';
import { useVoyageContext } from './hooks/useVoyageContext';
import { useAstronautState } from './hooks/useAstronautState';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');

  // Brain connection: null = still checking, false = none resolves (own or
  // household) → surface the quiet /connect pointer.
  const [hasBrain, setHasBrain] = useState<boolean | null>(null);

  // Auth state
  const { isAuthenticated, isLoading: isAuthLoading, sendMagicLink, signOut } = useAuth();

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

  // Voyage context (fetch voyages, pending invites, URL params)
  const { currentVoyage, setCurrentVoyage, voyages, displayName, refetchVoyages } = useVoyageContext({
    isAuthenticated,
    isAuthLoading,
  });

  // Conversation (transport, useChat, fetch, welcome, title sync, message queue)
  const {
    conversationId, conversationTitle, isLoadingConversation,
    messages, sendMessage, setMessages, status, error,
    hasUserTyped, setHasUserTyped, autoSentCount,
    messageTimestamps, messageQueue, setMessageQueue,
    isLoading, isStreaming,
    showSuccess, setShowSuccess,
    startNewConversation, resumeConversation,
  } = useConversation({
    currentVoyage,
    authState,
    isAuthenticated,
    isAuthLoading,
  });

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

  // Followup state (extracted hook)
  const { triggerFollowup, triggerFollowupRef } = useMessageState({
    conversationId,
    status,
    setMessages: (fn) => setMessages(fn as any),
    setShowSuccess,
  });

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
    onTaskComplete: (taskId: string, data: Record<string, unknown>) => {
      setRunningTasks((prev) => prev.filter((t) => t.id !== taskId));
      if (data.result) {
        triggerFollowupRef.current(taskId);
      }
    },
  }), [triggerFollowupRef]);

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

  // Auto-scroll to bottom when new messages arrive
  const messageCount = messages.length;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messageCount]);

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
  const getMessageText = (message: UIMessage): string => {
    if (Array.isArray(message.parts)) {
      return message.parts
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map(part => part.text)
        .join('');
    }
    return '';
  };

  // Helper to extract ask_captain tool call parts from a UIMessage
  const getAskCaptainParts = (message: UIMessage): Array<{
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
  };

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

  // Keep triggerFollowup ref updated so realtime handler always has latest function
  useEffect(() => {
    triggerFollowupRef.current = triggerFollowup;
  }, [triggerFollowup]);

  // Filter auto-sent messages for rendering
  const visibleMessages = useMemo(() => {
    let userMsgsSeen = 0;
    return messages.filter((msg) => {
      if (msg.role === 'user') {
        userMsgsSeen++;
        if (userMsgsSeen <= autoSentCount.current) return false;
      }
      return true;
    });
  }, [messages, autoSentCount]);
  const errorText = error?.message?.trim().startsWith('{')
    ? "that one didn't get through. try again?"
    : (error?.message || "that one didn't get through. try again?");

  return (
    <div className={`min-h-screen bg-[#050505] text-slate-300 font-mono text-sm selection:bg-indigo-500/30 overflow-x-hidden relative ${className || ''}`}>

      {/* CONTEXT BAR - Fixed header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#050505] backdrop-blur-md px-4 h-[52px] flex items-center justify-between shadow-2xl overflow-hidden">
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
              </div>
            </>
          )}
        </div>

        {displayName && (
          <div className="hidden sm:block text-[10px] text-slate-500 font-mono tracking-widest uppercase shrink-0">
            {displayName.toUpperCase().replace(/\s+/g, '_')}
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-[#ff5f56]/70 via-[#5ec98f]/70 to-[#b07af5]/70" />
      </div>

      {/* THE STREAM — astronaut band + scrollable messages
          Padding: header (52px) + astronaut band (280px) = 332px in conversation mode */}
      <div className="max-w-2xl mx-auto px-4 pb-48" style={{ paddingTop: hasUserTyped ? '332px' : '52px' }}>

        {/* ASTRONAUT BAND — fixed below header in conversation mode */}
        <div
          className={`z-40 flex flex-col items-center pointer-events-none transition-all duration-700 ease-in-out ${
            !hasUserTyped
              ? 'sticky top-[52px] min-h-[calc(100vh-52px-120px)] justify-center'
              : 'fixed top-[52px] left-0 right-0 h-[280px] justify-center bg-[#050505] overflow-hidden'
          }`}
        >
          {!hasUserTyped && (
            <VoyagerWordmark variant="hero" className="-mb-20 scale-[0.74] sm:-mb-32 sm:scale-90" />
          )}
          <div className="transition-all duration-700 ease-in-out scale-[0.88] sm:scale-100">
            <AstronautState state={astronautState} beat={astronautBeat} size={astronautSize} />
          </div>
          {!hasUserTyped && (
            <p className="mt-1 sm:mt-5 text-center text-[11px] sm:text-xs tracking-[0.24em] sm:tracking-[0.5em] text-transparent bg-clip-text bg-gradient-to-r from-[#f7a34b] via-[#f4e04d] to-[#59a5ff] opacity-60">
              let&apos;s go together
            </p>
          )}
          {progressLabel && isStreaming && (
            <div className="text-center text-xs text-slate-500 mt-1 animate-pulse">
              {progressLabel}
            </div>
          )}
          {/* Bottom gradient boundary — Voyager's territory fades into message space */}
          {hasUserTyped && (
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-b from-transparent to-[#050505] pointer-events-none" />
          )}
        </div>

        <div className="space-y-12">

        {/* Messages — auto-sent user messages (hidden prompts) are filtered from rendering */}
        {visibleMessages.map((message, index) => {
          const msgDate = messageTimestamps.current.get(message.id) ?? new Date();
          const timestamp = msgDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });

          const content = getMessageText(message);

          if (message.role === 'user') {
            return (
              <UserMessage
                key={message.id}
                content={content}
                timestamp={timestamp}
                username="you"
              />
            );
          }

          if (message.role === 'assistant') {
            const isCurrentlyStreaming = isStreaming && index === visibleMessages.length - 1;
            const captainParts = getAskCaptainParts(message);

            // If this message has ask_captain tool calls, render them inline
            if (captainParts.length > 0) {
              const messageParts: import('@/components/chat/AssistantMessage').MessagePart[] = [];

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

              return (
                <AssistantMessage
                  key={message.id}
                  parts={messageParts}
                  timestamp={timestamp}
                  isStreaming={isCurrentlyStreaming}
                  onAction={handleComponentAction}
                />
              );
            }

            return (
              <AssistantMessage
                key={message.id}
                content={content}
                timestamp={timestamp}
                isStreaming={isCurrentlyStreaming}
              />
            );
          }

          return null;
        })}

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

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
        </div>{/* end space-y-12 messages wrapper */}
      </div>

      {/* INPUT DECK */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#050505] backdrop-blur border-t border-white/10 p-4 pb-6">
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
      </div>
    </div>
  );
};
