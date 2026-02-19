// Agent Task Queue
// Manages background retrieval tasks

import { getAdminClient } from '@/lib/supabase/admin'
import { getClientForContext } from '@/lib/supabase/authenticated'

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
  result?: RetrievalResult
  error?: string
  durationMs?: number
  createdAt: Date
}

export interface RetrievalResult {
  findings: Array<{
    eventId: string
    content: string
    similarity?: number
    connectedTo?: string[]
  }>
  confidence: number
  summary?: string
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

  // Note: Using type assertion until we regenerate Supabase types
  const { data, error } = await (supabase as any)
    .from('agent_tasks')
    .insert({
      task: params.task,
      code: params.code,
      priority: params.priority ?? 'normal',
      user_id: params.userId,
      voyage_slug: params.voyageSlug,
      conversation_id: params.conversationId,
      original_query: params.originalQuery ?? null,
      conversation_snapshot: params.conversationSnapshot ?? null,
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

  const { error } = await (supabase as any)
    .from('agent_tasks')
    .update({
      status: 'running',
      progress,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)

  if (error) {
    console.error('[AgentQueue] Failed to update progress:', error)
    // Don't throw - progress updates are non-critical
  }
}

/**
 * Mark a task as complete with results.
 * Emits background.completed event for downstream processing.
 */
export async function completeTask(
  taskId: string,
  result: RetrievalResult,
  durationMs: number,
  meta?: { conversationId?: string; userId?: string }
): Promise<void> {
  const supabase = getAdminClient()

  // Note: Using type assertion until we regenerate Supabase types
  const { error } = await (supabase as any)
    .from('agent_tasks')
    .update({
      status: 'complete',
      completed_at: new Date().toISOString(),
      result,
      duration_ms: durationMs,
    })
    .eq('id', taskId)

  if (error) {
    console.error('[AgentQueue] Failed to complete task:', error)
    throw new Error(`Failed to complete task: ${error.message}`)
  }

  console.log(`[AgentQueue] Task completed: ${taskId} (${durationMs}ms)`)

  // Emit event for downstream processing (followup, etc.)
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

  // Note: Using type assertion until we regenerate Supabase types
  const { error } = await (supabase as any)
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
 * Get a single task by ID.
 * Used for followup generation when background task completes.
 */
export async function getTaskById(taskId: string): Promise<AgentTask | null> {
  const supabase = getAdminClient()

  const { data, error } = await (supabase as any)
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
    result: data.result as RetrievalResult | undefined,
    error: data.error as string | undefined,
    durationMs: data.duration_ms as number | undefined,
    createdAt: new Date(data.created_at as string),
  }
}
