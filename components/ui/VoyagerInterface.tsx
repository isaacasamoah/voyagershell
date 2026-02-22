"use client";

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { Terminal, Activity, Ship } from 'lucide-react';
import { UserMessage, AssistantMessage, AstronautState, TaskCard, type TaskProgress } from '@/components/chat';
import { useAuth } from '@/lib/auth/context';
import { log } from '@/lib/debug';
import { getSuggestions, getWelcomeSuggestion, type SuggestionContext } from '@/lib/ui/suggestions';
import { type UIComponentMessage } from '@/lib/ui/components';
import { useRealtimeSubscription } from './hooks/useRealtimeSubscription';
import { useMessageState } from './hooks/useMessageState';
import { InputArea } from './InputArea';
import { AskCaptainRenderer } from './AskCaptainRenderer';

// Voyage types
interface VoyageMembership {
  id: string;
  slug: string;
  name: string;
  role: 'captain' | 'crew';
  joinedAt: string;
}

interface VoyagerInterfaceProps {
  className?: string;
}

// API response types
interface ConversationData {
  id: string;
  title: string | null;
  status: string;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
}

interface MessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface ConversationResponse {
  conversation: ConversationData;
  messages: MessageData[];
}

// Running task from background worker (in-progress)
interface RunningTask {
  id: string;
  task: string;
  progress?: TaskProgress;
}

// Convert API message to UIMessage format for useChat
const apiMessageToUIMessage = (msg: MessageData): UIMessage => ({
  id: msg.id,
  role: msg.role,
  parts: [{ type: 'text' as const, text: msg.content }],
});

export const VoyagerInterface = ({ className }: VoyagerInterfaceProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');

  // Auth state
  const { user, isAuthenticated, isLoading: isAuthLoading, sendMagicLink, signOut } = useAuth();

  // Conversation state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(true);

  // Message queue - type while Voyager is thinking
  const [messageQueue, setMessageQueue] = useState<string[]>([]);

  // Voyage state (for context bar display)
  const [currentVoyage, setCurrentVoyage] = useState<VoyageMembership | null>(null);
  const [voyages, setVoyages] = useState<VoyageMembership[]>([]);

  // Background agent state (running tasks)
  const [runningTasks, setRunningTasks] = useState<RunningTask[]>([]);

  // Celebration state — drives singleton astronaut to 'celebrating' briefly
  const [showSuccess, setShowSuccess] = useState(false);

  // Hero → conversation mode: tracks whether the user has typed their first message.
  // Voyager's auto-welcome keeps hero state. Only user engagement collapses it.
  const [hasUserTyped, setHasUserTyped] = useState(false);
  const autoSentCount = useRef(0);

  // UI component messages (ephemeral, in-stream)
  const [uiMessages, setUiMessages] = useState<UIComponentMessage[]>([]);

  // State for system feedback
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Auth state tracking for system prompt injection
  const [authState, setAuthState] = useState<'unauthenticated' | 'authenticated' | 'just-authenticated'>('unauthenticated');

  // Refs to track current state for the transport
  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = conversationId;
  const voyageSlugRef = useRef<string | null>(null);
  voyageSlugRef.current = currentVoyage?.slug ?? null;
  const authStateRef = useRef(authState);
  authStateRef.current = authState;

  // Create transport with dynamic body that reads current conversationId and voyage
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    body: () => ({
      conversationId: conversationIdRef.current,
      voyageSlug: voyageSlugRef.current,
      authState: authStateRef.current,
    }),
  }), []);

  // useChat with transport
  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport,
  });

  // Auto-continue: fetch active conversation on mount and when voyage changes
  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      setIsLoadingConversation(false);
      return;
    }

    const fetchActiveConversation = async () => {
      try {
        const voyageSlug = currentVoyage?.slug;
        const url = voyageSlug
          ? `/api/conversation?voyageSlug=${encodeURIComponent(voyageSlug)}`
          : '/api/conversation';
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch conversation');

        const data: ConversationResponse = await res.json();
        setConversationId(data.conversation.id);
        setConversationTitle(data.conversation.title);

        if (data.messages.length > 0) {
          const uiMessages = data.messages.map(apiMessageToUIMessage);
          setMessages(uiMessages);
          setHasUserTyped(true);
        } else {
          setMessages([]);
        }

        log.voyage('Loaded conversation', { conversationId: data.conversation.id, voyageSlug: voyageSlug ?? 'personal' });
      } catch (error) {
        console.error('[Voyager] Failed to fetch conversation:', error);
      } finally {
        setIsLoadingConversation(false);
      }
    };

    fetchActiveConversation();
  }, [setMessages, isAuthenticated, isAuthLoading, currentVoyage?.slug]);

  // Detect when user just logged in (after magic link) — celebrate + set auth state.
  // Welcome prompt is handled by the unified hidden welcome effect below.
  const wasAuthenticatedRef = useRef(isAuthenticated);
  useEffect(() => {
    if (isAuthLoading) return;

    if (isAuthenticated && !wasAuthenticatedRef.current) {
      // Fresh login — celebrate and mark as just-authenticated
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
  }, [isAuthenticated, isAuthLoading]);

  // Hidden welcome prompt — triggers Voyager's creative welcome without visible user message.
  // Works for both unauth (sign-in flow) and authed users returning to empty conversations.
  const hasTriggeredWelcomePrompt = useRef(false);
  useEffect(() => {
    if (isAuthLoading || isLoadingConversation) return;
    if (hasTriggeredWelcomePrompt.current) return;
    if (messages.length > 0) return;

    hasTriggeredWelcomePrompt.current = true;
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const voyageContext = currentVoyage ? ` in ${currentVoyage.name}` : '';

    const timer = setTimeout(() => {
      autoSentCount.current++;
      sendMessage({ text: `good ${timeOfDay}${voyageContext}` });
    }, 300);
    return () => clearTimeout(timer);
  }, [isAuthLoading, isLoadingConversation, isAuthenticated, messages.length, sendMessage, currentVoyage]);

  // Fetch voyages when authenticated (for context bar)
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) return;

    const fetchVoyages = async () => {
      try {
        const res = await fetch('/api/voyages');
        if (!res.ok) return;

        const data = await res.json();
        setVoyages(data.voyages || []);

        // Check for pending invite from join page
        const pendingInvite = localStorage.getItem('pendingInvite');
        if (pendingInvite) {
          localStorage.removeItem('pendingInvite');
          const joinRes = await fetch(`/api/voyages/join/${pendingInvite}`, { method: 'POST' });
          if (joinRes.ok) {
            const joinData = await joinRes.json();
            const refreshRes = await fetch('/api/voyages');
            if (refreshRes.ok) {
              const refreshData = await refreshRes.json();
              setVoyages(refreshData.voyages || []);
              const joined = refreshData.voyages?.find((v: VoyageMembership) => v.slug === joinData.voyage.slug);
              if (joined) {
                setCurrentVoyage(joined);
                setFeedbackMessage(joinData.alreadyMember
                  ? `You're already a member of ${joinData.voyage.name}!`
                  : `Welcome to ${joinData.voyage.name}!`);
                setTimeout(() => setFeedbackMessage(null), 3000);
              }
            }
          }
        }

        // Check URL for voyage param
        const urlParams = new URLSearchParams(window.location.search);
        const voyageSlug = urlParams.get('voyage');
        if (voyageSlug && data.voyages) {
          const voyage = data.voyages.find((v: VoyageMembership) => v.slug === voyageSlug);
          if (voyage) {
            setCurrentVoyage(voyage);
          }
        }
      } catch (error) {
        log.voyage('Failed to fetch voyages', { error: String(error) }, 'error');
      }
    };

    fetchVoyages();
  }, [isAuthenticated, isAuthLoading]);

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

  // Derived state for loading
  const isLoading = status === 'submitted' || status === 'streaming';
  const isStreaming = status === 'streaming';
  const prevStatusRef = useRef(status);

  // Show success astronaut briefly when response completes
  useEffect(() => {
    const wasStreaming = prevStatusRef.current === 'streaming';
    const nowReady = status === 'ready';

    if (wasStreaming && nowReady && messages.length > 0) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 2500);
      return () => clearTimeout(timer);
    }

    prevStatusRef.current = status;
  }, [status, messages.length]);

  // Detect sign_out tool call — fire signOut() after Voyager's farewell streams
  useEffect(() => {
    if (status !== 'ready' || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'assistant' || !Array.isArray(lastMsg.parts)) return;

    const hasSignOut = lastMsg.parts.some((p) => {
      const part = p as Record<string, unknown>;
      // AI SDK v6: static tools → part.type === "tool-{name}", dynamic → "dynamic-tool" + toolName
      if (part.type === 'tool-sign_out') return true;
      if (part.type === 'dynamic-tool' && part.toolName === 'sign_out') return true;
      return false;
    });

    if (hasSignOut) {
      const timer = setTimeout(() => signOut(), 1500);
      return () => clearTimeout(timer);
    }
  }, [status, messages, signOut]);

  // Process queued messages when Voyager finishes responding
  useEffect(() => {
    if (!isLoading && messageQueue.length > 0 && conversationId) {
      const nextMessage = messageQueue[0];
      setMessageQueue(prev => prev.slice(1));
      setTimeout(() => {
        sendMessage({ text: nextMessage });
      }, 100);
    }
  }, [isLoading, messageQueue, conversationId, sendMessage]);

  // Auto-scroll to bottom when new messages arrive
  const messageCount = messages.length;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messageCount]);

  // Compute step depth and tool info from current streaming message for astronaut states
  const { stepDepth, lastToolName, hasBackgroundSpawn } = useMemo(() => {
    if (!isStreaming || messages.length === 0) return { stepDepth: 0, lastToolName: null as string | null, hasBackgroundSpawn: false };
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'assistant' || !Array.isArray(lastMessage.parts)) {
      return { stepDepth: 0, lastToolName: null as string | null, hasBackgroundSpawn: false };
    }
    let depth = 0;
    let toolName: string | null = null;
    let bgSpawn = false;
    for (const part of lastMessage.parts) {
      const p = part as Record<string, unknown>;
      if (p.type === 'step-start') depth++;
      // AI SDK v6: static tools → "tool-{name}", dynamic → "dynamic-tool" + toolName
      if (typeof p.type === 'string' && p.type.startsWith('tool-')) {
        toolName = (p.type as string).slice(5);
        if (toolName === 'spawn_background_agent') bgSpawn = true;
      } else if (p.type === 'dynamic-tool') {
        toolName = (p.toolName as string) ?? null;
        if (toolName === 'spawn_background_agent') bgSpawn = true;
      }
    }
    return { stepDepth: depth, lastToolName: toolName, hasBackgroundSpawn: bgSpawn };
  }, [isStreaming, messages]);

  // Map tool names to human-readable progress labels
  const progressLabel = useMemo((): string | null => {
    if (!isStreaming || !lastToolName) return null;
    const labels: Record<string, string> = {
      semantic_search: 'Searching memory...',
      keyword_grep: 'Looking for exact matches...',
      get_connected: 'Following connections...',
      get_nodes: 'Fetching details...',
      search_by_time: 'Checking the timeline...',
      web_search: 'Checking the web...',
      spawn_background_agent: 'Searching in the background...',
      ask_captain: 'Preparing something for you...',
    };
    return labels[lastToolName] ?? null;
  }, [isStreaming, lastToolName]);

  // Compute singleton astronaut state with step-aware depth
  const astronautState = useMemo((): 'idle' | 'searching' | 'celebrating' | 'error' | 'listening' => {
    if (error) return 'error';
    if (showSuccess) return 'celebrating';
    if (isLoading) {
      // Step-depth-aware states during streaming
      if (hasBackgroundSpawn) return 'listening';    // handed off to background
      if (stepDepth >= 5) return 'listening';         // deep exploration
      if (stepDepth >= 3) return 'listening';         // multi-step retrieval
      return 'searching';                             // initial steps
    }
    if (isAuthLoading || isLoadingConversation) return 'searching';
    return 'idle';
  }, [error, showSuccess, isLoading, isAuthLoading, isLoadingConversation, stepDepth, hasBackgroundSpawn]);

  // Astronaut size: xl hero when user hasn't engaged, lg docked when they have
  const astronautSize = hasUserTyped ? 'lg' : 'xl';

  // All messages go to Voyager — no intent detection, no slash commands, no auth gate
  // Unauth users can type: the chat route handles null conversationId server-side
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    setHasUserTyped(true);
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

  // Context chip click sends a message to Voyager instead of calling a handler
  const handleVoyageChipClick = useCallback(() => {
    if (!conversationId) return;
    if (isLoading) {
      setMessageQueue(prev => [...prev, 'show my voyages']);
    } else {
      sendMessage({ text: 'show my voyages' });
    }
  }, [conversationId, isLoading, sendMessage]);

  // Send a message as the user (used by ask_captain components)
  const sendUserMessage = useCallback((text: string) => {
    setHasUserTyped(true);
    if (isLoading) {
      setMessageQueue(prev => [...prev, text]);
    } else {
      sendMessage({ text });
    }
  }, [isLoading, sendMessage]);

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
  // AI SDK v6: static → "tool-ask_captain", dynamic → "dynamic-tool" + toolName
  const getAskCaptainParts = (message: UIMessage): Array<{
    toolCallId: string
    state: string
    input: unknown
  }> => {
    if (!Array.isArray(message.parts)) return [];
    const results: Array<{ toolCallId: string; state: string; input: unknown }> = [];
    for (const part of message.parts) {
      const p = part as Record<string, unknown>;
      const isAskCaptain = p.type === 'tool-ask_captain' ||
        (p.type === 'dynamic-tool' && p.toolName === 'ask_captain');
      if (isAskCaptain) {
        results.push({
          toolCallId: p.toolCallId as string,
          state: p.state as string,
          input: p.input,
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

  // Merge chat messages with UI component messages for unified stream
  type MergedMessage =
    | { source: 'chat'; message: UIMessage }
    | { source: 'ui'; message: UIComponentMessage };

  const mergedMessages = useMemo((): MergedMessage[] => {
    const chatMsgs: MergedMessage[] = messages.map(m => ({
      source: 'chat' as const,
      message: m,
    }));
    const uiMsgs: MergedMessage[] = uiMessages.map(m => ({
      source: 'ui' as const,
      message: m,
    }));
    return [...chatMsgs, ...uiMsgs];
  }, [messages, uiMessages]);

  // Handler for component actions in the stream (will be wired to ask_captain in MVP 2)
  const handleComponentAction = useCallback((action: string, data?: unknown) => {
    // Component selections send a message to Voyager
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

  return (
    <div className={`min-h-screen bg-[#050505] text-slate-300 font-mono text-sm selection:bg-indigo-500/30 overflow-x-hidden relative ${className || ''}`}>

      {/* SVG FILTERS (The "Terminal Look" Engine) */}
      <svg className="absolute w-0 h-0">
        <defs>
          <filter id="terminal-dither">
            <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0" />
            <feTurbulence type="fractalNoise" baseFrequency="0.80" numOctaves="3" stitchTiles="stitch" result="noise" />
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.2 0" in="noise" result="coloredNoise" />
            <feComposite operator="in" in="coloredNoise" in2="SourceGraphic" result="composite" />
            <feBlend mode="multiply" in="composite" in2="SourceGraphic" />
          </filter>
        </defs>
      </svg>

      {/* CONTEXT BAR - Fixed header */}
      <div className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#050505]/95 backdrop-blur-md px-4 py-3 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-indigo-400 group cursor-pointer">
            <Terminal size={16} className="group-hover:text-indigo-300 transition-colors" />
            <span className="font-bold tracking-wider group-hover:underline decoration-indigo-500/30 underline-offset-4">VOYAGER_SHELL</span>
          </div>

          {/* Context Chips - only show when authenticated */}
          {isAuthenticated && (
            <>
              <div className="h-4 w-[1px] bg-white/10 mx-1"></div>

              <div className="flex gap-2">
                {/* Voyage context chip — click sends message to Voyager */}
                {currentVoyage ? (
                  <button
                    type="button"
                    onClick={handleVoyageChipClick}
                    className="px-2 py-1 rounded-sm border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs flex items-center gap-2 cursor-pointer hover:bg-purple-500/20 transition shadow-[0_0_10px_rgba(168,85,247,0.1)]"
                  >
                    <Ship size={10} />
                    <span className="opacity-30 font-semibold">$VOY:</span> {currentVoyage.name.toUpperCase().replace(/\s+/g, '_')}
                    <span className="opacity-50 text-[10px]">({currentVoyage.role})</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleVoyageChipClick}
                    className="px-2 py-1 rounded-sm border border-slate-700 bg-slate-800/50 text-slate-400 text-xs flex items-center gap-2 cursor-pointer hover:bg-slate-700/50 transition"
                  >
                    <Ship size={10} />
                    <span className="opacity-30 font-semibold">$VOY:</span> PERSONAL
                  </button>
                )}
                {/* Conversation context chip */}
                <div className="px-2 py-1 rounded-sm border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs flex items-center gap-2 cursor-pointer hover:bg-indigo-500/20 transition shadow-[0_0_10px_rgba(99,102,241,0.1)]">
                  <span className="opacity-30 font-semibold">$CTX:</span> {conversationTitle || 'NEW_SESSION'}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 text-[10px] text-green-500/80 font-bold tracking-widest uppercase">
          <Activity size={10} className="animate-pulse" />
          <span>System Online</span>
        </div>
      </div>

      {/* THE STREAM — astronaut band + scrollable messages */}
      <div className={`max-w-2xl mx-auto px-4 pb-48 ${hasUserTyped ? 'pt-[332px]' : 'pt-[52px]'}`}>

        {/* ASTRONAUT BAND — fixed below header in conversation mode.
            Hero state: fills viewport to center astronaut (landing page feel).
            Conversation mode: fixed 280px band, always visible, full opacity.
            Transition trigger: user's first typed message, not Voyager's welcome. */}
        <div
          className={`z-40 flex flex-col items-center pointer-events-none transition-all duration-700 ease-in-out ${
            !hasUserTyped
              ? 'sticky top-[52px] min-h-[calc(100vh-52px-120px)] justify-center'
              : 'fixed top-[52px] left-0 right-0 h-[280px] justify-center'
          }`}
        >
          <div className="transition-all duration-700 ease-in-out">
            <AstronautState state={astronautState} size={astronautSize} />
          </div>
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

        {/* Messages - unified stream of chat + UI messages.
            Auto-sent user messages (hidden prompts) are filtered from rendering. */}
        {(() => {
          let userMsgsSeen = 0;
          return mergedMessages.filter((item) => {
            if (item.source === 'chat' && item.message.role === 'user') {
              userMsgsSeen++;
              if (userMsgsSeen <= autoSentCount.current) return false;
            }
            return true;
          });
        })().map((item, index) => {
          const timestamp = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });

          // UI Component Message
          if (item.source === 'ui') {
            const uiMsg = item.message;
            const parts = uiMsg.parts.map(part => {
              if (part.type === 'text') {
                return { type: 'text' as const, text: part.text };
              }
              const componentWithHandler = {
                ...part.component,
                props: {
                  ...part.component.props,
                  onSelect: part.component.type === 'voyage_picker'
                    ? (slug: string) => handleComponentAction('voyage_select', slug)
                    : undefined,
                },
              };
              return { type: 'component' as const, component: componentWithHandler };
            });

            return (
              <AssistantMessage
                key={uiMsg.id}
                parts={parts}
                timestamp={timestamp}
                onAction={handleComponentAction}
              />
            );
          }

          // Regular Chat Message
          const message = item.message;
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
            const isCurrentlyStreaming = isStreaming && index === mergedMessages.length - 1 && item.source === 'chat';
            const captainParts = getAskCaptainParts(message);

            // If this message has ask_captain tool calls, render them inline
            if (captainParts.length > 0) {
              const messageParts: import('@/components/chat/AssistantMessage').MessagePart[] = [];

              // Add text content if present
              if (content) {
                messageParts.push({ type: 'text', text: content });
              }

              // Add ask_captain components as react element parts
              for (const captainPart of captainParts) {
                messageParts.push({
                  type: 'react',
                  element: (
                    <AskCaptainRenderer
                      key={captainPart.toolCallId}
                      input={captainPart.input as Parameters<typeof AskCaptainRenderer>[0]['input']}
                      toolState={captainPart.state}
                      toolCallId={captainPart.toolCallId}
                      sendMagicLink={sendMagicLink}
                      onSendMessage={sendUserMessage}
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

        {/* No inline loading/success indicators — astronaut singleton is the sole status indicator (AC9) */}

        {/* Error state */}
        {error && (
          <div className="flex gap-4">
            <div className="w-12 pt-1 text-right text-red-500/50 text-[10px] font-bold tracking-widest">
              ERR
            </div>
            <div className="flex-1">
              <div className="text-red-400 text-sm p-3 border border-red-500/30 bg-red-500/10 rounded-sm">
                {error.message || 'An error occurred. Please try again.'}
              </div>
            </div>
          </div>
        )}

        {feedbackMessage && (
          <div className="flex gap-4">
            <div className="w-12 pt-1 text-right text-green-500/50 text-[10px] font-bold tracking-widest">
              SYS
            </div>
            <div className="flex-1">
              <div className="text-green-400 text-sm p-3 border border-green-500/30 bg-green-500/10 rounded-sm">
                {feedbackMessage}
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
      <div className="fixed bottom-0 left-0 right-0 bg-[#050505]/95 backdrop-blur border-t border-white/10 p-4 pb-6">
        <div className="max-w-2xl mx-auto">
          {/* Context-Aware Suggestions */}
          {suggestions.length > 0 && (
            <div className="flex gap-3 mb-3 overflow-x-auto pb-1 scrollbar-hide">
              {suggestions.map(suggestion => (
                <button
                  key={suggestion.id}
                  type="button"
                  onClick={() => handleSuggestionClick(suggestion.action)}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors whitespace-nowrap"
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
