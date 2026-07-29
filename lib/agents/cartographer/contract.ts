import { z } from 'zod'
import topicMatcherContract from './topic-matcher-contract.json'

export const CARTOGRAPHER_EXTRACTOR_VERSION = 'cartographer-single-claim-v4'
export const CARTOGRAPHER_PHYSICS_VERSIONS = [
  'cartographer-single-claim-v2',
  'cartographer-single-claim-v3',
  CARTOGRAPHER_EXTRACTOR_VERSION,
] as const
export const TOPIC_MATCHER_VERSION = topicMatcherContract.version
export const TOPIC_CANDIDATE_FLOOR = topicMatcherContract.candidateFloor
export const TOPIC_CANDIDATE_LIMIT = topicMatcherContract.candidateLimit
export const TOPIC_MATCHER_PROMPT = topicMatcherContract.instruction

const extractionFields = {
  claim: z.string().trim().min(1).nullable(),
  aboutPersonId: z.string().uuid().nullable(),
  knowledgeType: z.enum(['domain', 'operational', 'preference']),
  attentionScore: z.number().min(0).max(1),
  contextSnippet: z.string().trim().min(1),
}

const refineExtraction = (
  value: { claim: string | null; aboutPersonId: string | null },
  context: z.RefinementCtx,
): void => {
  if (value.claim === null && value.aboutPersonId !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'about_requires_claim',
      path: ['aboutPersonId'],
    })
  }
}

export const historicalExtractionSchema = z.object(extractionFields)
  .strict()
  .superRefine(refineExtraction)
export const v3ExtractionSchema = z.object({
  ...extractionFields,
  topics: z.array(z.string().trim().min(1).max(120)).max(3),
}).strict().superRefine((value, context) => {
  refineExtraction(value, context)
  if (value.claim === null && value.topics.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'topics_require_claim',
      path: ['topics'],
    })
  }
  const normalized = value.topics.map((topic) => (
    topic.toLowerCase().replace(/\s+/g, ' ').trim()
  ))
  if (new Set(normalized).size !== normalized.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'topics_must_be_unique',
      path: ['topics'],
    })
  }
})
export const extractionSchema = historicalExtractionSchema
export const topicMatcherSchema = z.object({
  topics: z.array(z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('existing'),
      topicId: z.string().uuid(),
    }).strict(),
    z.object({
      kind: z.literal('new'),
      label: z.string().trim().min(1).max(120),
    }).strict(),
  ])).max(3),
}).strict().superRefine((value, context) => {
  const identities = value.topics.map((topic) => (
    topic.kind === 'existing'
      ? `existing:${topic.topicId}`
      : `new:${topic.label.toLowerCase().replace(/\s+/g, ' ').trim()}`
  ))
  if (new Set(identities).size !== identities.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'topic_matches_must_be_unique',
      path: ['topics'],
    })
  }
})

export type HistoricalExtractionObject = z.infer<typeof historicalExtractionSchema>
export type V3ExtractionObject = z.infer<typeof v3ExtractionSchema>
export type ExtractionObject = z.infer<typeof extractionSchema>
export type AnyExtractionObject =
  | HistoricalExtractionObject
  | V3ExtractionObject
  | ExtractionObject
export type TopicMatcherObject = z.infer<typeof topicMatcherSchema>

const BASE_PROMPT = `You are Voyager's Cartographer.

Judge exactly one immutable human-authored source event. Return one structured
object with:
- claim: one durable fact stated by the source, or null when there is no durable claim;
- aboutPersonId: one supplied Person ID when the claim is explicitly about that
  person, otherwise null;
- knowledgeType: domain, operational, or preference;
- attentionScore: 0 to 1;
- contextSnippet: a concise declarative restatement useful for retrieval.
`

export const HISTORICAL_CARTOGRAPHER_PROMPT = `${BASE_PROMPT}
Never invent a Person ID. You may copy only an ID from the supplied candidates.
Do not infer a claim from prior knowledge, and do not return more than one claim.
For a null claim, aboutPersonId must also be null.`

export const V3_CARTOGRAPHER_PROMPT = `${BASE_PROMPT}
- topics: zero to three concise subject labels. Reuse an offered topic label when
  it describes the same subject; otherwise propose a new label.

Never invent a Person ID. You may copy only an ID from the supplied candidates.
Topic labels are proposals only: the server owns identity and persistence.
Do not infer a claim from prior knowledge, and do not return more than one claim.
For a null claim, aboutPersonId must also be null and topics must be empty.`

export const CARTOGRAPHER_PROMPT = HISTORICAL_CARTOGRAPHER_PROMPT

export const isV3Contract = (version: string): boolean => (
  version === 'cartographer-single-claim-v3'
)

export const isCurrentContract = (version: string): boolean => (
  version === CARTOGRAPHER_EXTRACTOR_VERSION
)

export const requiresUnitPhysics = (version: string): boolean => (
  CARTOGRAPHER_PHYSICS_VERSIONS.includes(
    version as (typeof CARTOGRAPHER_PHYSICS_VERSIONS)[number],
  )
)
