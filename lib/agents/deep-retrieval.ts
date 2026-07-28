// Agentic Retrieval Agent (Background)
//
// Single generateText call with retrieval tools.
// The agent reasons, searches, evaluates, and iterates
// until it has enough information or hits the step limit.
//
// Replaces the old code-sandbox executor pattern entirely.

import { generateText, stepCountIs } from 'ai'
import { createRetrievalTools } from '@/lib/retrieval/retrieval-tools'
import type { ToolContext } from '@/lib/retrieval/tool-types'
import type { BackgroundTaskResult } from './queue'
import { updateTaskProgress } from './queue'
import { resolveUserModelWithMeta } from '@/lib/models'
import { log } from '@/lib/debug'

// =============================================================================
// Types
// =============================================================================

export interface BackgroundRetrievalInput {
  taskId: string
  objective: string
  context?: string
  userId: string
  voyageSlug?: string
  conversationId: string
}

// =============================================================================
// System Prompt
// =============================================================================

const AGENTIC_RETRIEVAL_PROMPT = `You are a retrieval agent for Voyager. Your job is to find comprehensive, relevant information from the user's knowledge base.

You have tools for semantic search, keyword grep, graph traversal, time-based search, and web search. Use them strategically:

1. START with a semantic search on the core topic
2. EVALUATE results — are they sufficient? Do they suggest new search angles?
3. If results reference specific terms or names, use keyword_grep for precision
4. If results have connections, use graph to explore the knowledge graph
5. If the objective mentions time, use search_by_time
6. STOP when you have enough information or you're seeing diminishing returns

Think between each tool call. Explain what you found and what you'll search for next.

Your final response must be a self-authored Voyager message that clearly synthesizes
what you found for the user. It will be delivered to the user verbatim, so do not
describe it as notes for another assistant and do not ask another model to rewrite it.`

const TOOL_RESULT_DIGEST_LENGTH = 600

const compactToolResult = (toolName: string, output: unknown): string | null => {
  let text: string
  if (typeof output === 'string') {
    text = output
  } else {
    try {
      text = JSON.stringify(output)
    } catch {
      text = String(output)
    }
  }

  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) return null

  const digest = compact.length > TOOL_RESULT_DIGEST_LENGTH
    ? `${compact.slice(0, TOOL_RESULT_DIGEST_LENGTH)}…`
    : compact
  return `${toolName}: ${digest}`
}

const getStructuredEventId = (output: unknown): string | undefined => {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return undefined
  const record = output as Record<string, unknown>
  const eventId = record.eventId ?? record.event_id
  return typeof eventId === 'string' ? eventId : undefined
}

// =============================================================================
// Main Entry Point
// =============================================================================

export async function runBackgroundRetrieval(
  input: BackgroundRetrievalInput,
  signal?: AbortSignal
): Promise<BackgroundTaskResult> {
  const { taskId, objective, context, userId, voyageSlug, conversationId } = input
  const shortTaskId = taskId.slice(0, 8)

  log.agent(`[${shortTaskId}] === AGENTIC RETRIEVAL START ===`, {
    objective: objective.slice(0, 100),
    userId: userId.slice(0, 8),
  })

  await updateTaskProgress(taskId, { stage: 'searching', percent: 10 })

  const toolCtx: ToolContext = { userId, voyageSlug, conversationId }
  const tools = createRetrievalTools(toolCtx)

  const prompt = context
    ? `Objective: ${objective}\n\nConversation context:\n${context}`
    : `Objective: ${objective}`

  const findings: BackgroundTaskResult['findings'] = []
  const resolved = await resolveUserModelWithMeta(
    { task: 'chat', quality: 'balanced' },
    userId,
  )
  const result = await generateText({
    abortSignal: signal,
    model: resolved.model,
    system: AGENTIC_RETRIEVAL_PROMPT,
    prompt,
    tools,
    stopWhen: stepCountIs(20),
    maxOutputTokens: 4096,
    onStepFinish: ({ toolResults }) => {
      for (const toolResult of toolResults) {
        const content = compactToolResult(toolResult.toolName, toolResult.output)
        if (!content) continue

        const eventId = getStructuredEventId(toolResult.output)
        findings.push(eventId ? { eventId, content } : { content })
      }
    },
  })

  await updateTaskProgress(taskId, { stage: 'analyzing', percent: 80 })

  log.agent(`[${shortTaskId}] === AGENTIC RETRIEVAL COMPLETE ===`, {
    findings: findings.length,
    steps: result.steps.length,
  })

  // The final text IS the delivered message — never ship a blank bubble.
  // Empty text + findings → honest fallback; empty both → throw (the guard
  // converts it into failTask, not a false 'complete').
  const finalText = result.text.trim()
  const message = finalText.length > 0
    ? finalText
    : findings.length > 0
      ? `I dug into this and surfaced ${findings.length} related item${findings.length === 1 ? '' : 's'}, but couldn't shape a clear answer. Ask me again and I'll go deeper.`
      : ''
  if (!message) {
    throw new Error('Background research produced no answer text and no findings')
  }

  return {
    findings,
    confidence: findings.length > 0 ? Math.min(findings.length / 5, 1.0) : 0,
    message,
  }
}
