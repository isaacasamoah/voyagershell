import { useCallback, useRef, useState } from 'react';
import type { UIMessage } from 'ai';
import { log } from '@/lib/debug';

interface UseMessageStateParams {
  conversationId: string | null;
  status: string;
  setMessages: (fn: (prev: UIMessage[]) => UIMessage[]) => void;
  setShowSuccess: (show: boolean) => void;
}

/**
 * Manages followup streaming and background agent → Voyager communication.
 * Extracts the streamFollowupIntoMessages and triggerFollowup logic.
 */
export const useMessageState = ({
  conversationId,
  status,
  setMessages,
  setShowSuccess,
}: UseMessageStateParams) => {
  const [followupInProgress, setFollowupInProgress] = useState(false);
  const triggerFollowupRef = useRef<(taskId: string) => void>(() => {});

  const streamFollowupIntoMessages = useCallback(async (stream: ReadableStream) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    const messageId = `followup-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: messageId,
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: '' }],
      },
    ]);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          const textMatch = line.match(/^0:"(.*)"/);
          if (textMatch) {
            const content = textMatch[1]
              .replace(/\\n/g, '\n')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
            fullText += content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId
                  ? { ...m, parts: [{ type: 'text' as const, text: fullText }] }
                  : m
              )
            );
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (fullText.length > 0) {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2500);
    }
  }, [setMessages, setShowSuccess]);

  const triggerFollowup = useCallback(
    async (taskId: string) => {
      if (status === 'streaming' || status === 'submitted' || followupInProgress) {
        log.agent('Followup deferred - chat busy', { taskId, status, followupInProgress });
        return;
      }

      if (!conversationId) {
        log.agent('Followup skipped - no conversationId', { taskId });
        return;
      }

      setFollowupInProgress(true);
      log.agent('Triggering followup', { taskId, conversationId });

      try {
        const response = await fetch('/api/chat/followup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, taskId }),
        });

        if (!response.ok || !response.body) {
          throw new Error(`Followup request failed: ${response.status}`);
        }

        await streamFollowupIntoMessages(response.body);
      } catch (error) {
        log.agent('Followup failed', { error: String(error) }, 'error');
      } finally {
        setFollowupInProgress(false);
      }
    },
    [conversationId, status, followupInProgress, streamFollowupIntoMessages]
  );

  return {
    followupInProgress,
    triggerFollowup,
    triggerFollowupRef,
  };
};
