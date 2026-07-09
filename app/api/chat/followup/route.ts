// Followup API endpoint
// Generates Voyager's follow-up message when background task completes.
// Uses the SAME prompt, model, and voice as the primary chat route.
// Called by UI when realtime subscription fires task completion.

import { streamText } from 'ai'
import { getTaskById } from '@/lib/agents/queue'
import { loadConversationMessages, saveMessage } from '@/lib/conversation'
import { composeSystemPrompt, getBasePrompt } from '@/lib/prompts'
import { emitMessageEvent } from '@/lib/knowledge'
import { requireAuthResponse } from '@/lib/auth'
import { resolveUserModel } from '@/lib/models'
import { log } from '@/lib/debug'

export const maxDuration = 30

export const POST = async (req: Request) => {
  log.api('Followup request received')

  try {
    // Require authentication
    const authResult = await requireAuthResponse()
    if (authResult instanceof Response) return authResult
    const userId = authResult

    const { conversationId, taskId } = await req.json()

    if (!conversationId || !taskId) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', message: 'conversationId and taskId are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 1. Fetch the completed task
    const task = await getTaskById(taskId)
    if (!task) {
      log.api('Followup failed - task not found', { taskId }, 'error')
      return new Response(
        JSON.stringify({ error: 'Task not found', message: `No task found with ID: ${taskId}` }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (task.status !== 'complete') {
      return new Response(
        JSON.stringify({ error: 'Task not complete', message: `Task status is ${task.status}, expected complete` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (task.userId !== userId) {
      return new Response(
        JSON.stringify({ error: 'Forbidden', message: 'Task does not belong to this user' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (task.conversationId !== conversationId) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', message: 'Task does not belong to this conversation' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 2. Format findings as context for the system prompt
    const findings = task.result?.findings ?? []
    const findingsContext = findings.length > 0
      ? [
          '\n\n[Background Research Findings]',
          `Your background search for "${task.task}" found ${findings.length} relevant items:`,
          ...findings.slice(0, 10).map((f, i) => `${i + 1}. ${f.content.slice(0, 300)}`),
          task.result?.summary ? `\nSummary: ${task.result.summary}` : '',
          '\nShare these findings naturally. Don\'t say "background search" — just share what you found, as if you were thinking about it.',
        ].join('\n')
      : ''

    // 3. Compose system prompt (same as primary Voyager)
    // Followup doesn't need dynamic prompt (no auth state or continuity per-turn)
    let systemPrompt: string
    try {
      const { staticPrompt } = await composeSystemPrompt(
        task.userId,
        { voyageSlug: task.voyageSlug }
      )
      systemPrompt = staticPrompt + findingsContext
    } catch {
      systemPrompt = getBasePrompt() + findingsContext
    }

    // 4. Load real conversation history
    const conversationMessages = await loadConversationMessages(conversationId, 50)
    const messages = conversationMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    log.agent('Generating followup', {
      taskId,
      conversationId,
      findingsCount: findings.length,
      messageCount: messages.length,
    })

    // 5. Stream response using primary Voyager's model (same voice)
    const result = streamText({
      model: await resolveUserModel({ task: 'chat', quality: 'balanced', streaming: true }, task.userId),
      system: systemPrompt,
      messages,
      maxOutputTokens: 2048,
      onFinish: async ({ text }) => {
        log.agent('Followup complete', { textLength: text?.length ?? 0 })

        if (text) {
          await saveMessage(conversationId, 'assistant', text)
          emitMessageEvent(conversationId, 'assistant', text, {
            userId: task.userId,
            voyageSlug: task.voyageSlug,
            participants: [task.userId],
            eventType: 'conversation',
          })
        }
      },
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    log.api('Followup API error', { error: String(error) }, 'error')

    if (error instanceof SyntaxError) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', message: 'Invalid JSON in request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Internal error', message: 'An unexpected error occurred' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
