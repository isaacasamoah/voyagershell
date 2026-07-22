import { generateText, stepCountIs } from 'ai'
import { z } from 'zod'
import { GRAPH_NODE_KINDS } from '@/lib/knowledge/kernel/contract'
import { resolveUserModel } from '@/lib/models'
import { createRetrievalTools, type ToolContext } from '@/lib/retrieval/tools'
import type { Stage1Assessment, Stage2Connection } from './types'

export const CARTOGRAPHER_EDGE_KINDS = [
  'about',
  'supports',
  'contradicts',
  'supersedes',
  'elaborates',
  'relates_to',
  'decided_by',
  'raised_by',
] as const

const nodeReferenceSchema = z.object({
  kind: z.enum(GRAPH_NODE_KINDS),
  authorityId: z.string().uuid(),
}).strict()

const connectionSchema = z.object({
  source: nodeReferenceSchema,
  target: nodeReferenceSchema,
  kind: z.enum(CARTOGRAPHER_EDGE_KINDS),
}).strict().superRefine((edge, context) => {
  const sourceKind = edge.source.kind
  const targetKind = edge.target.kind
  if (sourceKind === targetKind && edge.source.authorityId === edge.target.authorityId) {
    context.addIssue({ code: 'custom', message: 'self_edge_forbidden' })
  }
  const knowledgePair = sourceKind === 'knowledge_unit' && targetKind === 'knowledge_unit'
  const valid = edge.kind === 'about'
    ? ['message_event', 'knowledge_unit'].includes(sourceKind) && targetKind !== 'voyager'
    : ['supports', 'contradicts', 'supersedes', 'elaborates'].includes(edge.kind)
      ? knowledgePair
      : ['decided_by', 'raised_by'].includes(edge.kind)
        ? sourceKind === 'knowledge_unit' && targetKind === 'person'
        : edge.kind === 'relates_to'

  if (!valid) context.addIssue({ code: 'custom', message: 'invalid_edge_endpoint_kinds' })
})

const connectionsSchema = z.array(connectionSchema)

export const STAGE2_PROMPT = `You are the Cartographer for Voyager (Stage 2: Relationship Mapping).

Find genuine connections between the Stage 1 message-event nodes and existing graph nodes from previous sessions. Use context snippets as search queries.

Every endpoint must be a canonical graph-node reference returned by the input or retrieval tools:
{ "kind": "<graph node kind>", "authorityId": "<immutable authority id>" }

Graph node kinds: person, voyager, voyage, space, message_event, knowledge_unit.

Output each edge in this final shape:
{ "source": { "kind": "knowledge_unit", "authorityId": "<id>" }, "target": { "kind": "knowledge_unit", "authorityId": "<id>" }, "kind": "supports" }

Cartographer may emit only these semantic kinds: about, supports, contradicts, supersedes, elaborates, relates_to, decided_by, raised_by.

The complete edge vocabulary and direction is:
- authored_by: message_event -> person
- posted_in: message_event -> space
- reply_to: message_event -> message_event
- in_voyage: space -> voyage
- member_of: person -> space or voyage
- companion_of: voyager -> person
- derived_from: knowledge_unit -> message_event
- generated_by: message_event or knowledge_unit -> voyager
- about: message_event or knowledge_unit -> any non-voyager subject node
- supports: evidence knowledge_unit -> claim knowledge_unit
- contradicts: knowledge_unit -> knowledge_unit
- supersedes: replacement knowledge_unit -> stale knowledge_unit
- elaborates: detail knowledge_unit -> summary knowledge_unit
- relates_to: canonical lateral relationship; use sparingly
- decided_by: decision knowledge_unit -> person
- raised_by: concern or idea knowledge_unit -> person

Structural relationships are normally projected synchronously. Do not invent one in Stage 2. Only return edges whose endpoint kind and immutable authorityId are known. Never use database row IDs as authority IDs unless the node contract makes them identical.

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
        kind: 'message_event',
        authorityId: assessment.eventId,
      })
      return `[${reference}] (${assessment.knowledgeType}, ${assessment.attentionScore}): `
        + assessment.contextSnippet
    })
    .join('\n')
  if (!contextSummary) return []

  const {
    semantic_search,
    keyword_grep,
    graph,
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
    tools: { semantic_search, keyword_grep, graph, get_nodes, search_by_time },
    stopWhen: stepCountIs(6),
    maxOutputTokens: 4096,
  })

  return parseStage2Connections(result.text)
}
