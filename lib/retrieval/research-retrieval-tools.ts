import { tool } from 'ai'
import { z } from 'zod'
import { completeTask, enqueueAgentTask, runGuardedBackgroundTask } from '@/lib/agents/queue'
import { createMessageEvent } from '@/lib/knowledge/events'
import type { ToolContext } from './tool-types'

const spawnBackgroundAgentSchema = z.object({
  objective: z.string().describe('What to find or research. Be specific about the topic, time range, or scope.'),
  context: z.string().optional().describe('Relevant context from the conversation to help guide the search.'),
  priority: z.enum(['low', 'normal', 'high']).optional().default('normal'),
})

const webSearchSchema = z.object({
  query: z.string().describe('Search query for the web'),
  recency: z.enum(['day', 'week', 'month', 'any']).optional().default('any')
    .describe('How recent should results be'),
})

export const createResearchRetrievalTools = (ctx: ToolContext) => ({
  spawn_background_agent: tool({
    description: `Spawn a background agent for deep asynchronous research. The agent works independently and its finished answer arrives in the user's feed as a delivered Voyager message. YOU MUST CALL THIS TOOL whenever you tell the user you are researching in the background — announcing research without calling it is a false promise. Suitable for comprehensive multi-topic searches or research spanning long time periods.`,
    inputSchema: spawnBackgroundAgentSchema,
    execute: async (input) => {
      if (!ctx.conversationId) return 'Cannot spawn background agent: no conversation context'
      const { objective, context, priority } = input
      try {
        const originalQuery = ctx.messages?.filter((message) => message.role === 'user').pop()?.content
        const taskId = await enqueueAgentTask({
          task: objective,
          code: '',
          priority: priority ?? 'normal',
          userId: ctx.userId,
          voyageSlug: ctx.voyageSlug,
          conversationId: ctx.conversationId,
          originalQuery,
          conversationSnapshot: ctx.messages?.slice(-20),
        })
        if (ctx.waitUntil) {
          const executeTask = async () => {
            const startTime = Date.now()
            await runGuardedBackgroundTask({
              taskId,
              run: async (signal) => {
                const { runBackgroundRetrieval } = await import('@/lib/agents/deep-retrieval')
                return runBackgroundRetrieval({
                  taskId,
                  objective,
                  context: context ?? '',
                  userId: ctx.userId,
                  voyageSlug: ctx.voyageSlug,
                  conversationId: ctx.conversationId!,
                }, signal)
              },
              onComplete: async (result) => {
                const eventId = await createMessageEvent(
                  ctx.conversationId!,
                  'assistant',
                  result.message,
                  {
                    userId: ctx.userId,
                    voyageSlug: ctx.voyageSlug,
                    participants: [ctx.userId],
                    source: 'agent',
                    attentionScore: 0.85,
                    eventType: 'conversation',
                    contextSnippet: `Voyager research: ${objective.slice(0, 60)}`,
                  },
                )
                if (!eventId) throw new Error('Failed to create background research message event')
                await completeTask(taskId, result, Date.now() - startTime)
                console.log(`[spawn_background_agent] Task ${taskId.slice(0, 8)} completed: ${result.findings.length} findings`)
              },
              onFailure: (error) => {
                console.error(`[spawn_background_agent] Task ${taskId.slice(0, 8)} failed:`, error)
              },
            })
          }
          ctx.waitUntil(executeTask())
        }
        return `Background search started for "${objective.slice(0, 50)}...". Findings will surface when ready.`
      } catch (error) {
        console.error('[spawn_background_agent] Failed to enqueue:', error)
        return `Failed to spawn background agent: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    },
  }),

  web_search: tool({
    description: `Search the web for external information. Returns formatted search results with titles, snippets, and URLs. Supports recency filtering. Example queries: "React 19 release date", "latest Next.js features", "Anthropic pricing".`,
    inputSchema: webSearchSchema,
    execute: async ({ query, recency }) => {
      console.log(`[web_search] Query: "${query}", Recency: ${recency}`)
      const { searchWeb, formatSearchResults } = await import('@/lib/search/tavily')
      const { answer, results, error } = await searchWeb(query, { recency })
      if (error) return `Web search unavailable: ${error}`
      return formatSearchResults(results, answer)
    },
  }),
})
