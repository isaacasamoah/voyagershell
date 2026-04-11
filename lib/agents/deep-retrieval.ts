// Agentic Retrieval Agent (Background)
//
// Single generateText call with retrieval tools.
// The agent reasons, searches, evaluates, and iterates
// until it has enough information or hits the step limit.
//
// Replaces the old code-sandbox executor pattern entirely.

import { generateText, stepCountIs } from 'ai'
import { createRetrievalTools, type ToolContext } from '@/lib/retrieval/tools'
import type { RetrievalResult } from './queue'
import { updateTaskProgress } from './queue'
import { modelRouter } from '@/lib/models'
import { resolveApiKey } from '@/lib/keys'
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

When done, provide a clear summary of your findings. Focus on what's most relevant to the objective.`

// =============================================================================
// Main Entry Point
// =============================================================================

export async function runBackgroundRetrieval(
  input: BackgroundRetrievalInput
): Promise<RetrievalResult> {
  const { taskId, objective, context, userId, voyageSlug, conversationId } = input
  const shortTaskId = taskId.slice(0, 8)

  log.agent(`[${shortTaskId}] === AGENTIC RETRIEVAL START ===`, {
    objective: objective.slice(0, 100),
    userId: userId.slice(0, 8),
  })

  await updateTaskProgress(taskId, { stage: 'searching', percent: 10 })

  // Resolve the user's reasoning key. If none is configured, return a no-op
  // result -- background retrieval must never crash the caller.
  const resolvedKey = await resolveApiKey(userId, 'reasoning', { voyageSlug })
  if (!resolvedKey) {
    log.agent(
      `[${shortTaskId}] No reasoning key configured, returning no-op`,
      { userId: userId.slice(0, 8) },
      'warn'
    )
    await updateTaskProgress(taskId, { stage: 'analyzing', percent: 100 })
    return {
      findings: [],
      confidence: 0,
      summary:
        'Deep retrieval skipped: no LLM API key configured. Add one at /settings/keys to enable background agents.',
    }
  }

  const toolCtx: ToolContext = { userId, voyageSlug, conversationId }
  const tools = createRetrievalTools(toolCtx)

  const prompt = context
    ? `Objective: ${objective}\n\nConversation context:\n${context}`
    : `Objective: ${objective}`

  const result = await generateText({
    model: modelRouter.select({
      task: 'chat',
      quality: 'balanced',
      resolvedKey,
    }),
    system: AGENTIC_RETRIEVAL_PROMPT,
    prompt,
    tools,
    stopWhen: stepCountIs(20),
    maxOutputTokens: 4096,
  })

  await updateTaskProgress(taskId, { stage: 'analyzing', percent: 80 })

  // Extract findings from tool call results
  const findings: RetrievalResult['findings'] = []
  const seenIds = new Set<string>()

  for (const step of result.steps) {
    for (const toolResult of step.toolResults) {
      const text = typeof toolResult.output === 'string' ? toolResult.output : ''
      // Parse node IDs from formatted results: [N] id:XXXXXXXX
      const idRegex = /id:([a-f0-9]{8})/g
      let match: RegExpExecArray | null
      while ((match = idRegex.exec(text)) !== null) {
        const shortId = match[1]
        if (!seenIds.has(shortId)) {
          seenIds.add(shortId)
          // Extract the content line after the ID line
          const idPos = text.indexOf(`id:${shortId}`)
          const contentStart = text.indexOf('\n', idPos)
          const contentEnd = text.indexOf('\n\n', contentStart + 1)
          const content = contentEnd > 0
            ? text.slice(contentStart + 1, contentEnd).trim()
            : text.slice(contentStart + 1, contentStart + 300).trim()

          if (content) {
            findings.push({ eventId: shortId, content })
          }
        }
      }
    }
  }

  log.agent(`[${shortTaskId}] === AGENTIC RETRIEVAL COMPLETE ===`, {
    findings: findings.length,
    steps: result.steps.length,
  })

  return {
    findings,
    confidence: findings.length > 0 ? Math.min(findings.length / 5, 1.0) : 0,
    summary: result.text || `Found ${findings.length} relevant items.`,
  }
}
