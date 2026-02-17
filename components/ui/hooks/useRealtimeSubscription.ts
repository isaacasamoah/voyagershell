import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { log } from '@/lib/debug';
import type { TaskProgress } from '@/components/chat';

interface RealtimeCallbacks {
  onTaskInsert: (task: { id: string; task: string; progress?: TaskProgress }) => void;
  onTaskUpdate: (taskId: string, status: string, data: Record<string, unknown>) => void;
  onTaskComplete: (taskId: string, data: Record<string, unknown>) => void;
}

/**
 * Subscribe to background agent task changes via Supabase Realtime.
 * Handles INSERT (new tasks) and UPDATE (progress, completion, failure).
 */
export const useRealtimeSubscription = (
  conversationId: string | null,
  isAuthenticated: boolean,
  callbacks: RealtimeCallbacks
) => {
  useEffect(() => {
    if (!conversationId || !isAuthenticated) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`agents:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_tasks',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newData = payload.new as Record<string, unknown>;
          const status = newData.status as string;

          if (status === 'pending' || status === 'running') {
            log.agent('Background task started', { taskId: newData.id });
            callbacks.onTaskInsert({
              id: newData.id as string,
              task: newData.task as string,
              progress: newData.progress as TaskProgress | undefined,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agent_tasks',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newData = payload.new as Record<string, unknown>;
          const taskId = newData.id as string;
          const status = newData.status as string;

          if (status === 'running') {
            callbacks.onTaskUpdate(taskId, status, newData);
          } else if (status === 'complete') {
            callbacks.onTaskComplete(taskId, newData);
          } else if (status === 'failed') {
            log.agent('Background task failed', { taskId, error: newData.error });
            callbacks.onTaskUpdate(taskId, status, newData);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, isAuthenticated, callbacks]);
};
