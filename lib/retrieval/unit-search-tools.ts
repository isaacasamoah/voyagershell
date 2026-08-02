import { tool } from 'ai'
import { z } from 'zod'
import {
  anchoredUnitSearch,
  getKnowledgeUnitsByIds,
  keywordUnitSearch,
  semanticUnitSearch,
  type KnowledgeUnitSearchResult,
} from '@/lib/knowledge/unit-search'
import type { CitationRecorder } from './knowledge-retrieval-tools'
import { resolveOneMember } from './tool-helpers'
import type { ToolContext } from './tool-types'

const semanticSchema = z.object({
  query: z.string().min(1).describe('The semantic search query'),
  limit: z.number().int().min(1).max(15).optional().default(10),
  threshold: z.number().min(0).max(1).optional().default(0.6),
})

const keywordSchema = z.object({
  pattern: z.string().min(1).describe('Keywords to find in memory claims'),
  limit: z.number().int().min(1).max(20).optional().default(10),
})

const anchoredSchema = z.object({
  person: z.string().min(1).describe('The person to anchor on'),
  query: z.string().min(1).optional().describe('Optional topic filter'),
  limit: z.number().int().min(1).max(20).optional().default(15),
})

const getNodesSchema = z.object({
  nodeIds: z.array(z.string().uuid()).max(50)
    .describe('Complete knowledge-unit UUIDs returned by memory tools'),
})

const formatHits = (
  result: KnowledgeUnitSearchResult,
  empty: string,
  includeSourceContent = false,
): string => {
  if (result.outcome === 'error')
    return 'Memory search was cut short; do not infer that no memory exists.'
  if (result.hits.length === 0) return empty
  return result.hits.map((hit, index) => {
    const pinned = hit.effectiveAttention >= 0.9 ? ' [PINNED]' : ''
    const score = hit.score === null ? '' : ` (${hit.score.toFixed(3)})`
    const source = includeSourceContent
      ? `\nSource content:\n${hit.sourceContent}`
      : ''
    return `[${index + 1}] id:${hit.unitId} source:${hit.sourceEventId}${pinned}${score}\n${hit.claim}${source}`
  }).join('\n\n')
}

const deliver = async (
  ctx: ToolContext,
  recorder: CitationRecorder,
  result: KnowledgeUnitSearchResult,
  empty: string,
  includeSourceContent = false,
): Promise<string> => {
  if (result.outcome !== 'success' || result.hits.length === 0)
    return formatHits(result, empty, includeSourceContent)
  if (!ctx.conversationId) {
    return 'Memory search results were withheld because delivery could not be recorded.'
  }
  const citation = await recorder({
    personId: ctx.userId,
    sessionId: ctx.conversationId,
    channel: 'search',
    knowledgeUnitIds: result.hits.map((hit) => hit.unitId),
  })
  return citation.outcome === 'failed'
    ? 'Memory search results were withheld because delivery could not be recorded.'
    : formatHits(result, empty, includeSourceContent)
}

export const createUnitSearchTools = (
  ctx: ToolContext,
  citationRecorder: CitationRecorder,
) => ({
  semantic_search: tool({
    description: 'Semantic vector search over authorized knowledge-unit claims.',
    inputSchema: semanticSchema,
    execute: async (input) => deliver(
      ctx, citationRecorder,
      await semanticUnitSearch(ctx.userId, input.query, input),
      'No results found.',
    ),
  }),
  keyword_grep: tool({
    description: 'Keyword search over authorized knowledge-unit claims.',
    inputSchema: keywordSchema,
    execute: async (input) => deliver(
      ctx, citationRecorder,
      await keywordUnitSearch(ctx.userId, input.pattern, input),
      'No keyword matches found.',
    ),
  }),
  anchored_search: tool({
    description: 'Walk from a named Person and return their authorized authored claims.',
    inputSchema: anchoredSchema,
    execute: async (input) => {
      if (!ctx.voyageSlug) return 'Anchoring on a person needs a voyage context.'
      const member = await resolveOneMember(ctx, input.person)
      if ('error' in member) return member.error
      const empty = `Nothing from ${member.displayName}${input.query ? ` about "${input.query}"` : ''} that you can see.`
      return deliver(
        ctx, citationRecorder,
        await anchoredUnitSearch(
          ctx.userId, member.userId, input.query, input.limit,
        ),
        empty,
      )
    },
  }),
  get_nodes: tool({
    description: 'Hydrate exact authorized knowledge units by complete unit ID.',
    inputSchema: getNodesSchema,
    execute: async (input) => deliver(
      ctx, citationRecorder,
      await getKnowledgeUnitsByIds(ctx.userId, input.nodeIds),
      'No results found.',
      true,
    ),
  }),
})
