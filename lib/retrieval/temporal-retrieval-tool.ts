import { tool } from 'ai'
import { z } from 'zod'
import type { KnowledgeNode } from '@/lib/knowledge'
import { getAdminClient } from '@/lib/supabase/admin'
import { formatKnowledgeResult, parseRelativeDate } from './tool-helpers'
import type { ToolContext } from './tool-types'

const searchByTimeSchema = z.object({
  since: z.string().describe('Start date: ISO string (2024-01-15) or relative (yesterday, last week, 3 days ago)'),
  until: z.string().optional().describe('End date: ISO string or relative. Defaults to now.'),
  query: z.string().optional().describe('Optional semantic query to filter results'),
  limit: z.number().optional().default(15).describe('Max results'),
})

export const createTemporalRetrievalTool = (ctx: ToolContext) => tool({
  description: `Search knowledge by time range. Returns items from the specified period, newest first. Supports ISO dates (2024-01-15) and relative dates (yesterday, last week, 3 days ago). Optional semantic query to filter within the time range.`,
  inputSchema: searchByTimeSchema,
  execute: async (input) => {
    const sinceDate = parseRelativeDate(input.since)
    const untilDate = input.until ? parseRelativeDate(input.until) : new Date()
    const supabase = getAdminClient()
    const { data, error } = await supabase.rpc('scoped_knowledge_fetch', {
      p_user_id: ctx.userId,
      p_voyage_slug: ctx.voyageSlug,
      p_scope: ctx.voyageSlug ? 'all' : 'personal',
      p_since: sinceDate.toISOString(),
      p_until: untilDate.toISOString(),
      p_min_attention: 0.1,
      p_match_count: Math.min(input.limit, 30),
    })
    if (error) return `Error searching by time: ${error.message}`
    if (!data || data.length === 0) {
      return `No knowledge found between ${sinceDate.toLocaleDateString()} and ${untilDate.toLocaleDateString()}.`
    }

    const results: KnowledgeNode[] = data.map((row) => ({
      eventId: row.event_id,
      content: row.content,
      classifications: row.classifications ?? [],
      entities: row.entities ?? [],
      topics: row.topics ?? [],
      createdAt: new Date(row.source_created_at),
      knowledgeType: row.knowledge_type ?? null,
      attentionScore: row.attention_score ?? 0.5,
      contextSnippet: row.context_snippet ?? null,
    }))
    const filtered = input.query
      ? results.filter((result) => result.content.toLowerCase().includes(input.query!.toLowerCase()))
      : results
    if (filtered.length === 0) {
      return input.query
        ? `No knowledge matching "${input.query}" found between ${sinceDate.toLocaleDateString()} and ${untilDate.toLocaleDateString()}.`
        : `No knowledge found between ${sinceDate.toLocaleDateString()} and ${untilDate.toLocaleDateString()}.`
    }
    return `Found ${filtered.length} items from ${sinceDate.toLocaleDateString()} to ${untilDate.toLocaleDateString()}:\n\n${formatKnowledgeResult(filtered)}`
  },
})
