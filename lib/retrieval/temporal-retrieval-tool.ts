import { tool } from 'ai'
import { z } from 'zod'
import { temporalUnitSearch } from '@/lib/knowledge/unit-search'
import { recordKnowledgeUnitCitations } from '@/lib/knowledge/lifecycle/citations'
import { parseRelativeDate } from './tool-helpers'
import type { ToolContext } from './tool-types'

const searchByTimeSchema = z.object({
  since: z.string().describe('Start date: ISO string or relative date'),
  until: z.string().optional().describe('End date; defaults to now'),
  query: z.string().optional().describe('Optional text filter'),
  limit: z.number().int().min(1).max(30).optional().default(15),
})

export const createTemporalRetrievalTool = (ctx: ToolContext) => tool({
  description:
    'Search authorized knowledge-unit claims by their source event time.',
  inputSchema: searchByTimeSchema,
  execute: async (input) => {
    const sinceDate = parseRelativeDate(input.since)
    const untilDate = input.until ? parseRelativeDate(input.until) : new Date()
    const reached = await temporalUnitSearch(
      ctx.userId,
      sinceDate.toISOString(),
      untilDate.toISOString(),
      Math.min(input.limit, 30),
    )
    if (reached.outcome === 'error') {
      return 'Memory time search was cut short; do not infer that no memory exists.'
    }
    const hits = input.query
      ? reached.hits.filter((hit) =>
          hit.claim.toLowerCase().includes(input.query!.toLowerCase()))
      : reached.hits
    if (hits.length === 0) {
      return `No knowledge found between ${sinceDate.toLocaleDateString()} and ${untilDate.toLocaleDateString()}.`
    }
    if (!ctx.conversationId) {
      return 'Memory search results were withheld because delivery could not be recorded.'
    }
    const citation = await recordKnowledgeUnitCitations({
      personId: ctx.userId,
      sessionId: ctx.conversationId,
      channel: 'search',
      knowledgeUnitIds: hits.map((hit) => hit.unitId),
    })
    if (citation.outcome === 'failed') {
      return 'Memory search results were withheld because delivery could not be recorded.'
    }
    const formatted = hits.map((hit, index) =>
      `[${index + 1}] id:${hit.unitId} source:${hit.sourceEventId}\n${hit.claim}`,
    ).join('\n\n')
    return `Found ${hits.length} items from ${sinceDate.toLocaleDateString()} to ${untilDate.toLocaleDateString()}:\n\n${formatted}`
  },
})
