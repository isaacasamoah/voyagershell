import { z } from 'zod'

export const CARTOGRAPHER_EXTRACTOR_VERSION = 'cartographer-single-claim-v3'
export const CARTOGRAPHER_PHYSICS_VERSIONS = [
  'cartographer-single-claim-v2',
  CARTOGRAPHER_EXTRACTOR_VERSION,
] as const
export const TOPIC_SIMILARITY_THRESHOLD = 0.7
export const TOPIC_CANDIDATE_LIMIT = 8

const extractionFields = {
  claim: z.string().trim().min(1).nullable(),
  aboutPersonId: z.string().uuid().nullable(),
  knowledgeType: z.enum(['domain', 'operational', 'preference']),
  attentionScore: z.number().min(0).max(1),
  contextSnippet: z.string().trim().min(1),
}

const refineExtraction = (
  value: { claim: string | null; aboutPersonId: string | null; topics?: string[] },
  context: z.RefinementCtx,
): void => {
  if (value.claim === null && value.aboutPersonId !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'about_requires_claim',
      path: ['aboutPersonId'],
    })
  }
  if (value.claim === null && value.topics && value.topics.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'topics_require_claim',
      path: ['topics'],
    })
  }
  if (value.topics) {
    const normalized = value.topics.map((topic) => topic.toLowerCase().replace(/\s+/g, ' ').trim())
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'topics_must_be_unique',
        path: ['topics'],
      })
    }
  }
}

export const historicalExtractionSchema = z.object(extractionFields)
  .strict()
  .superRefine(refineExtraction)
export const extractionSchema = z.object({
  ...extractionFields,
  topics: z.array(z.string().trim().min(1).max(120)).max(3),
}).strict().superRefine(refineExtraction)

export type HistoricalExtractionObject = z.infer<typeof historicalExtractionSchema>
export type ExtractionObject = z.infer<typeof extractionSchema>
export type AnyExtractionObject = HistoricalExtractionObject | ExtractionObject

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

export const CARTOGRAPHER_PROMPT = `${BASE_PROMPT}
- topics: zero to three concise subject labels. Reuse an offered topic label when
  it describes the same subject; otherwise propose a new label.

Never invent a Person ID. You may copy only an ID from the supplied candidates.
Topic labels are proposals only: the server owns identity and persistence.
Do not infer a claim from prior knowledge, and do not return more than one claim.
For a null claim, aboutPersonId must also be null and topics must be empty.`

export const isV3Contract = (version: string): boolean => (
  version === CARTOGRAPHER_EXTRACTOR_VERSION
)

export const requiresUnitPhysics = (version: string): boolean => (
  CARTOGRAPHER_PHYSICS_VERSIONS.includes(
    version as (typeof CARTOGRAPHER_PHYSICS_VERSIONS)[number],
  )
)
