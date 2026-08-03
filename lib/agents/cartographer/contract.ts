import { z } from 'zod'
import topicMatcherContract from './topic-matcher-contract.json'

// G9 deferred C5: runtime activation remains v4. The frozen v5 candidate stays
// available only as evidence for its consumed one-shot acceptance result.
export const CARTOGRAPHER_EXTRACTOR_VERSION = 'cartographer-single-claim-v4'
export const CARTOGRAPHER_CANDIDATE_EXTRACTOR_VERSION =
  'cartographer-single-claim-v5'
export const CLAIM_BLOCKED_TOPIC_EXTRACTOR_VERSIONS = [
  CARTOGRAPHER_EXTRACTOR_VERSION,
] as const
export const CARTOGRAPHER_PHYSICS_VERSIONS = [
  'cartographer-single-claim-v2',
  'cartographer-single-claim-v3',
  ...CLAIM_BLOCKED_TOPIC_EXTRACTOR_VERSIONS,
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

// Units already stamped v4 must remain attributable to the exact prompt that
// judged them. V5 completes the contract in a new version instead of editing
// that historical prompt in place.
export const V4_CARTOGRAPHER_PROMPT = HISTORICAL_CARTOGRAPHER_PROMPT

export const V5_CARTOGRAPHER_PROMPT = `${BASE_PROMPT}
A claim is durable when its truth is asserted to hold beyond the moment of the
utterance: a reader a month later would still be reading an assertion rather
than a snapshot.

Return claim: null when the content asserts that an outcome has not yet been
settled. This includes a decision, conclusion, outcome, choice, or determination
that is pending, absent, ongoing, undecided, or still to come. Such content
asserts the absence of a settled fact; do not turn that absence into a durable
claim. Also return claim: null for greetings, thanks, acknowledgements, and
other social conversational acts, and when the entire content is a promise to
say something later.

For a durable claim, choose knowledgeType by this ordered procedure; first match
wins:
1. preference — the subject is the author or a supplied Person candidate and
   the predicate is that person's disposition: what they like, want, prefer,
   choose, or how they want things done. It can be restated as "this person
   prefers, wants, or likes X" without adding information.
2. operational — the predicate is an obligation or sequencing rule for action:
   something that must, should, or is to be done, including what must happen
   before, after, or when something else happens. It addresses whoever finds
   themselves in that situation rather than describing one occurrence, and can
   be restated as "do X before, after, or when Y" without adding information.
3. domain — every other durable claim: how something is, including structure,
   ownership, role, location, attribute, capability, or recurring behaviour. It
   can be restated as "this subject is, has, or does X" and asserts no
   obligation.

At the domain/operational rim, classify what the claim asserts, never what a
reader might do with it. A descriptive role or recurring behaviour is domain;
only an asserted obligation or sequencing rule is operational. Preference takes
priority over both even when the disposition has a before/after shape.

Never invent a Person ID. You may copy only an ID from the supplied candidates.
Do not infer a claim from prior knowledge, and do not return more than one claim.
For a null claim, aboutPersonId must also be null.`

export const CARTOGRAPHER_PROMPT = V4_CARTOGRAPHER_PROMPT

export const isV3Contract = (version: string): boolean => (
  version === 'cartographer-single-claim-v3'
)

export const isCurrentContract = (version: string): boolean => (
  version === CARTOGRAPHER_EXTRACTOR_VERSION
)

export const isClaimBlockedTopicContract = (version: string): boolean => (
  CLAIM_BLOCKED_TOPIC_EXTRACTOR_VERSIONS.includes(
    version as (typeof CLAIM_BLOCKED_TOPIC_EXTRACTOR_VERSIONS)[number],
  )
)

export const requiresUnitPhysics = (version: string): boolean => (
  CARTOGRAPHER_PHYSICS_VERSIONS.includes(
    version as (typeof CARTOGRAPHER_PHYSICS_VERSIONS)[number],
  )
)
