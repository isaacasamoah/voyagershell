import { generateText, stepCountIs } from 'ai'
import { z } from 'zod'
import { resolveUserModel } from '@/lib/models'
import { createRetrievalTools } from '@/lib/retrieval/retrieval-tools'
import type { ToolContext } from '@/lib/retrieval/tool-types'
import type { Stage1Assessment, Stage2Connection } from './types'

export const CARTOGRAPHER_EDGE_KINDS = [
  'supports',
  'contradicts',
  'supersedes',
  'elaborates',
  'triggered_by',
  'relates_to',
  'decided_by',
  'raised_by',
] as const

const connectionSchema = z.object({
  fromEventId: z.string().uuid(),
  toEventId: z.string().uuid(),
  edgeType: z.enum(CARTOGRAPHER_EDGE_KINDS),
}).strict().refine((edge) => edge.fromEventId !== edge.toEventId, 'self_edge_forbidden')

const connectionsSchema = z.array(connectionSchema)

export const STAGE2_PROMPT = `You are the Cartographer for Voyager (Stage 2: Relationship Mapping).

Find genuine connections between Stage 1 knowledge events and existing events from previous sessions. Use context snippets as search queries.

Output each edge in the deployed event-edge shape:
{ "fromEventId": "<source event UUID>", "toEventId": "<target event UUID>", "edgeType": "supports" }

Allowed edge types: supports, contradicts, supersedes, elaborates, triggered_by, relates_to, decided_by, raised_by.

Direction matters. Do not force connections. If none exist, return an empty array.
Output ONLY the JSON array at the end, prefixed with "CONNECTIONS:" on its own line.`

export const parseStage2Connections = (text: string): Stage2Connection[] => {
  const trimmed = text.trim()
  const prefixed = trimmed.match(/CONNECTIONS:\s*(\[[\s\S]*\])\s*$/)?.[1]
  const candidate = prefixed ?? trimmed.match(/\[[\s\S]*\]/)?.[0]
  if (!candidate) return []

  try {
    const parsed = connectionsSchema.safeParse(JSON.parse(candidate))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

export const runStage2 = async (
  assessments: Stage1Assessment[],
  ctx: ToolContext,
): Promise<Stage2Connection[]> => {
  const contextSummary = assessments
    .filter((assessment) => assessment.attentionScore >= 0.3)
    .map((assessment) => {
      const reference = JSON.stringify({
        eventId: assessment.eventId,
      })
      return `[${reference}] (${assessment.knowledgeType}, ${assessment.attentionScore}): `
        + assessment.contextSnippet
    })
    .join('\n')
  if (!contextSummary) return []

  const {
    semantic_search,
    keyword_grep,
    get_nodes,
    search_by_time,
  } = createRetrievalTools(ctx)
  const result = await generateText({
    model: await resolveUserModel({ task: 'chat', quality: 'balanced' }, ctx.userId),
    system: STAGE2_PROMPT,
    messages: [{
      role: 'user',
      content: `## Stage 1 Assessments\n${contextSummary}\n\nSearch for related existing knowledge using the retrieval tools. Then output connections.`,
    }],
    tools: { semantic_search, keyword_grep, get_nodes, search_by_time },
    stopWhen: stepCountIs(6),
    maxOutputTokens: 4096,
  })

  return parseStage2Connections(result.text)
}
