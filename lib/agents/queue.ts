// Agent Task Queue
// Manages background retrieval tasks

import { getAdminClient } from '@/lib/supabase/admin'
import { getClientForContext } from '@/lib/supabase/authenticated'
import type { Json } from '@/lib/supabase/types'

// =============================================================================
// Types
// =============================================================================

export interface AgentTask {
  id: string
  task: string
  code?: string | null
  priority: 'low' | 'normal' | 'high'
  userId: string
  voyageSlug?: string
  conversationId: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  result?: BackgroundTaskResult
  error?: string
  durationMs?: number
  createdAt: Date
}

export interface BackgroundTaskResult {
  findings: Array<{
    eventId?: string
    content: string
    similarity?: number
  }>
  confidence: number
  message: string
}

export interface EnqueueParams {
  task: string
  code?: string | null
  priority?: 'low' | 'normal' | 'high'
  userId: string
  voyageSlug?: string
  conversationId: string
  originalQuery?: string
  conversationSnapshot?: object[]
}

interface GuardedBackgroundTaskOptions<T> {
  taskId: string
  run: () => Promise<T>
  onComplete: (result: T) => Promise<void>
  onFailure?: (error: unknown) => void
  fail?: (taskId: string, errorMessage: string) => Promise<void>
  timeoutMs?: number
}

const BACKGROUND_TASK_TIMEOUT_MS = 25_000
const STUCK_TASK_TTL_MS = 5 * 60 * 1000
const REAPED_TASK_ERROR = 'reaped: no terminal state within TTL'

// =============================================================================
// Queue Operations
// =============================================================================

/**
 * Enqueue a new agent task.
 * Called by the spawn_background_agent tool.
 */
export async function enqueueAgentTask(params: EnqueueParams): Promise<string> {
  // Use authenticated client - user is creating their own task
  const supabase = getClientForContext({ userId: params.userId })

  const { data, error } = await supabase
    .from('agent_tasks')
    .insert({
      task: params.task,
      code: params.code ?? '',
      priority: params.priority ?? 'normal',
      user_id: params.userId,
      voyage_slug: params.voyageSlug,
      conversation_id: params.conversationId,
      original_query: params.originalQuery ?? null,
      conversation_snapshot: (params.conversationSnapshot as Json) ?? null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[AgentQueue] Failed to enqueue task:', error)
    throw new Error(`Failed to enqueue agent task: ${error.message}`)
  }

  console.log(`[AgentQueue] Task enqueued: ${(data as { id: string }).id}`)
  return (data as { id: string }).id
}

/**
 * Task progress shape for realtime updates.
 */
export interface TaskProgress {
  stage: 'searching' | 'analyzing' | 'reasoning'
  found?: number
  processed?: number
  percent?: number
}

/**
 * Update task progress (for realtime UI updates).
 * Called by background agents to report progress.
 */
export async function updateTaskProgress(
  taskId: string,
  progress: TaskProgress
): Promise<void> {
  const supabase = getAdminClient()

  const { error } = await supabase
    .from('agent_tasks')
    .update({
      status: 'running',
      progress: progress as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)

  if (error) {
    console.error('[AgentQueue] Failed to update progress:', error)
    // Don't throw - progress updates are non-critical
  }
}

/**
 * Mark a task as complete with results for the audit trail.
 */
export async function completeTask(
  taskId: string,
  result: BackgroundTaskResult,
  durationMs: number,
  meta?: { conversationId?: string; userId?: string }
): Promise<void> {
  const supabase = getAdminClient()

  const { error } = await supabase
    .from('agent_tasks')
    .update({
      status: 'complete',
      completed_at: new Date().toISOString(),
      result: result as unknown as Json,
      duration_ms: durationMs,
    })
    .eq('id', taskId)

  if (error) {
    console.error('[AgentQueue] Failed to complete task:', error)
    throw new Error(`Failed to complete task: ${error.message}`)
  }

  console.log(`[AgentQueue] Task completed: ${taskId} (${durationMs}ms)`)

  // Emit the existing completion signal for any audit consumers.
  if (meta?.conversationId && meta?.userId) {
    const { dispatcher } = await import('./event-dispatcher')
    dispatcher.emit('background.completed', {
      taskId,
      conversationId: meta.conversationId,
      userId: meta.userId,
    })
  }
}

/**
 * Mark a task as failed with error.
 */
export async function failTask(taskId: string, errorMessage: string): Promise<void> {
  const supabase = getAdminClient()

  const { error } = await supabase
    .from('agent_tasks')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: errorMessage,
    })
    .eq('id', taskId)

  if (error) {
    console.error('[AgentQueue] Failed to mark task as failed:', error)
    throw new Error(`Failed to fail task: ${error.message}`)
  }

  console.log(`[AgentQueue] Task failed: ${taskId} - ${errorMessage}`)
}

/**
 * Run a background task with a deadline and guarantee a terminal write attempt.
 */
export async function runGuardedBackgroundTask<T>({
  taskId,
  run,
  onComplete,
  onFailure,
  fail = failTask,
  timeoutMs = BACKGROUND_TASK_TIMEOUT_MS,
}: GuardedBackgroundTaskOptions<T>): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Background agent timed out')), timeoutMs)
  })

  try {
    const result = await Promise.race([run(), timeout])
    await onComplete(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    try {
      await fail(taskId, message)
    } catch (failError) {
      console.error(`[AgentQueue] Failed to record failure for task ${taskId}:`, failError)
    }
    onFailure?.(error)
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

/**
 * Fail pending or running tasks that have not written progress within the TTL.
 */
export async function reapStuckTasks(): Promise<number> {
  try {
    const tasks = () => (
      getAdminClient() as unknown as { from: (table: string) => any }
    ).from('agent_tasks')
    const cutoff = new Date(Date.now() - STUCK_TASK_TTL_MS).toISOString()
    const updatedAt = new Date().toISOString()

    // PostgREST updates cannot embed SQL expressions, so preserve
    // error=COALESCE(error, fallback) with two disjoint bulk updates.
    const { data: rowsWithoutError, error: nullError } = await tasks()
      .update({
        status: 'failed',
        error: REAPED_TASK_ERROR,
        updated_at: updatedAt,
      })
      .in('status', ['running', 'pending'])
      .lt('updated_at', cutoff)
      .is('error', null)
      .select('id')

    if (nullError) {
      console.error('[AgentQueue] Failed to reap stuck tasks:', nullError)
      return 0
    }

    const { data: rowsWithError, error: existingError } = await tasks()
      .update({
        status: 'failed',
        updated_at: updatedAt,
      })
      .in('status', ['running', 'pending'])
      .lt('updated_at', cutoff)
      .select('id')

    if (existingError) {
      console.error('[AgentQueue] Failed to reap stuck tasks:', existingError)
      return 0
    }

    return (rowsWithoutError?.length ?? 0) + (rowsWithError?.length ?? 0)
  } catch (error) {
    console.error('[AgentQueue] Failed to reap stuck tasks:', error)
    return 0
  }
}

/**
 * Get a single task by ID for audit inspection.
 */
export async function getTaskById(taskId: string): Promise<AgentTask | null> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('agent_tasks')
    .select('*')
    .eq('id', taskId)
    .single()

  if (error || !data) {
    console.error('[AgentQueue] Failed to get task by ID:', error)
    return null
  }

  return {
    id: data.id as string,
    task: data.task as string,
    code: data.code as string,
    priority: data.priority as 'low' | 'normal' | 'high',
    userId: data.user_id as string,
    voyageSlug: data.voyage_slug as string | undefined,
    conversationId: data.conversation_id as string,
    status: data.status as AgentTask['status'],
    result: data.result as unknown as BackgroundTaskResult | undefined,
    error: data.error as string | undefined,
    durationMs: data.duration_ms as number | undefined,
    createdAt: new Date(data.created_at as string),
  }
}
