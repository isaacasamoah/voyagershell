import { tool } from 'ai'
import { z } from 'zod'
import {
  getKnowledgeByIds,
  keywordGrep,
  personAnchoredSearch,
} from '@/lib/knowledge'
import { hybridSearch } from '@/lib/knowledge/hybrid'
import {
  formatGrepResult,
  formatHybridResult,
  formatKnowledgeResult,
  resolveOneMember,
} from './tool-helpers'
import type { ToolContext } from './tool-types'

const semanticSearchSchema = z.object({
  query: z.string().describe('The semantic search query'),
  limit: z.number().optional().default(10).describe('Max results to return (1-15)'),
  threshold: z.number().optional().default(0.6).describe('Min similarity (0-1)'),
})

const keywordGrepSchema = z.object({
  pattern: z.string().describe('Exact phrase or keyword to find'),
  caseSensitive: z.boolean().optional().default(false),
  limit: z.number().optional().default(10).describe('Max results'),
})

const anchoredSearchSchema = z.object({
  person: z.string().describe('The person to anchor on (name as the user referred to them)'),
  query: z.string().optional().describe('Optional topic to narrow to, e.g. "the almond tree idea"'),
  limit: z.number().optional().default(15),
})

const getNodesSchema = z.object({
  nodeIds: z.array(z.string().uuid()).describe('Array of complete event UUIDs to retrieve'),
})

export const createKnowledgeRetrievalTools = (ctx: ToolContext) => ({
  semantic_search: tool({
    description: `Semantic search across the knowledge base. Finds content by conceptual similarity to the query. Uses hybrid retrieval (semantic + keyword) with reciprocal rank fusion for higher quality results. Example queries: "pricing discussions", "onboarding decisions", "what we know about React performance".`,
    inputSchema: semanticSearchSchema,
    execute: async (input) => {
      const results = await hybridSearch(ctx.userId, input.query, {
        semanticThreshold: input.threshold,
        voyageSlug: ctx.voyageSlug,
      })
      return formatHybridResult(results.slice(0, input.limit))
    },
  }),
  keyword_grep: tool({
    description: `Exact keyword or phrase search across the knowledge base. Returns matches with highlighted context around the match. Example patterns: "React 19", "pricing tier", a person's name, a specific term or quote.`,
    inputSchema: keywordGrepSchema,
    execute: async (input) => formatGrepResult(await keywordGrep(ctx.userId, input.pattern, {
      caseSensitive: input.caseSensitive,
      limit: Math.min(input.limit, 20),
      voyageSlug: ctx.voyageSlug,
    })),
  }),
  anchored_search: tool({
    description: `Retrieve what a SPECIFIC PERSON has shared or contributed, optionally about a topic. Anchor-first retrieval: use this the moment the user names a person — "what did Vanessa say about X", "what has Tom contributed", "@vanessa on pricing". Returns that person's contributions that YOU can see (shared + co-participated), ranked by attention. For general topic search with no named person, use semantic_search instead.`,
    inputSchema: anchoredSearchSchema,
    execute: async (input) => {
      if (!ctx.voyageSlug) return 'Anchoring on a person needs a voyage context.'
      const member = await resolveOneMember(ctx, input.person)
      if ('error' in member) return member.error
      const results = await personAnchoredSearch(ctx.userId, member.userId, {
        voyageSlug: ctx.voyageSlug,
        query: input.query,
        limit: Math.min(input.limit ?? 15, 20),
      })
      if (results.length === 0) {
        return `Nothing from ${member.displayName}${input.query ? ` about "${input.query}"` : ''} that you can see.`
      }
      return formatGrepResult(results)
    },
  }),
  get_nodes: tool({
    description: `Retrieve specific knowledge nodes by their event IDs. Returns full node content and metadata for each requested ID.`,
    inputSchema: getNodesSchema,
    execute: async (input) =>
      formatKnowledgeResult(await getKnowledgeByIds(input.nodeIds, ctx.userId, ctx.voyageSlug)),
  }),
})
