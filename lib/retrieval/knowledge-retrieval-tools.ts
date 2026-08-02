import { tool } from 'ai'
import { z } from 'zod'
import {
  retrieveKnowledgeGraphClaims,
  type KnowledgeGraphRetrievalOptions,
  type KnowledgeGraphResult,
  type KnowledgeGraphRoot,
} from '@/lib/knowledge/kernel/boundary'
import {
  recordKnowledgeUnitCitations,
  type CitationRecordingInput,
  type CitationRecordingResult,
} from '@/lib/knowledge/lifecycle/citations'
import { createUnitSearchTools } from './unit-search-tools'
import type { ToolContext } from './tool-types'

const graphMemorySchema = z.object({
  maxDepth: z.number().int().min(0).max(8).optional().default(4),
  nodeBudget: z.number().int().min(1).max(512).optional().default(512),
  frontierBudget: z.number().int().min(1).max(128).optional().default(128),
})

type GraphMemoryRetriever = (
  root: KnowledgeGraphRoot,
  options?: KnowledgeGraphRetrievalOptions,
) => Promise<KnowledgeGraphResult>

export type CitationRecorder = (
  input: CitationRecordingInput,
) => Promise<CitationRecordingResult>

export const createKnowledgeRetrievalTools = (
  ctx: ToolContext,
  graphMemoryRetriever: GraphMemoryRetriever = retrieveKnowledgeGraphClaims,
  citationRecorder: CitationRecorder = recordKnowledgeUnitCitations,
) => ({
  graph_memory: tool({
    description:
      'Walk authorized memory from the speaking Person. Returns selected claims, source attribution, and viewer-visible tensions; reports budget truncation honestly.',
    inputSchema: graphMemorySchema,
    execute: async (input) => {
      const reached = await graphMemoryRetriever(
        { kind: 'person', authorityId: ctx.userId },
        {
          maxDepth: input.maxDepth,
          nodeBudget: input.nodeBudget,
          frontierBudget: input.frontierBudget,
          excludeUnitIds: ctx.workingMemoryUnitIds ?? [],
        },
      )
      const citation = reached.outcome === 'success' && reached.claims.length > 0
        ? ctx.conversationId
          ? await citationRecorder({
              personId: ctx.userId,
              sessionId: ctx.conversationId,
              channel: 'reach',
              knowledgeUnitIds: reached.claims.map(
                (claim) => claim.knowledgeUnitId,
              ),
            })
          : { outcome: 'failed' as const, inserted: 0 as const }
        : { outcome: 'skipped' as const, inserted: 0 as const }
      const result: KnowledgeGraphResult = citation.outcome === 'failed'
        ? { outcome: 'exception', claims: [], truncated: false }
        : reached
      return {
        outcome: result.outcome,
        claims: result.claims.map((claim) => ({
          unitId: claim.knowledgeUnitId,
          claim: claim.claim,
          type: claim.knowledgeType,
          source: {
            eventId: claim.sourceEventId,
            content: claim.sourceContent,
          },
          tensions: claim.tensions,
        })),
        truncated: result.truncated,
        presentation:
          result.outcome !== 'success'
            ? `Graph reach was cut short (${result.outcome}); do not infer that no memory exists.`
            : result.truncated
              ? 'Partial graph reach: do not present this as a complete memory search.'
              : 'Complete within the requested graph budgets.',
      }
    },
  }),
  ...createUnitSearchTools(ctx, citationRecorder),
})
