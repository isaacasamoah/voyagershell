import { z } from 'zod'
import topicMatcherContract from './topic-matcher-contract.json'

// v6 is the runtime contract: v5's classification procedure plus session
// context. Neither is a passed gate. v5's C5 verdict is K5A-V5-RESULT-FAIL --
// it missed the hard-core and about-person bars -- and v6 has never been run
// against that corpus at all. Both ship as harm reduction over a measurably
// worse v4. See docs/testing/receipts/memory/k5a-c5-v5-one-shot-result-2026-08-03.md
// and docs/testing/receipts/memory/wave2-context-contract-2026-08-04.md.
export const CARTOGRAPHER_EXTRACTOR_VERSION = 'cartographer-single-claim-v6'
// Superseded versions keep their entries: units stamped v4 or v5 still complete
// through the claim-blocked path on retry, and their prompt identity must not
// move.
export const CLAIM_BLOCKED_TOPIC_EXTRACTOR_VERSIONS = [
  'cartographer-single-claim-v4',
  'cartographer-single-claim-v5',
  CARTOGRAPHER_EXTRACTOR_VERSION,
] as const
// Only v6 receives session context. Earlier contracts were judged without it
// and must keep receiving the exact input that judged them.
export const SESSION_CONTEXT_EXTRACTOR_VERSIONS = [
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
// that historical prompt in place. This holds after v5 became current: v4
// attempts still resolve to this text.
export const V4_CARTOGRAPHER_PROMPT = HISTORICAL_CARTOGRAPHER_PROMPT

// Shared by v5 and v6 so the ordered classification procedure is stated once.
// v5's bytes must not move: extractor.test.ts pins its SHA-256 because the
// sealed C5 measurement describes that exact text.
const DURABILITY_AND_TYPE_BODY = `A claim is durable when its truth is asserted to hold beyond the moment of the
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
priority over both even when the disposition has a before/after shape.`

export const V5_CARTOGRAPHER_PROMPT = `${BASE_PROMPT}
${DURABILITY_AND_TYPE_BODY}

Never invent a Person ID. You may copy only an ID from the supplied candidates.
Do not infer a claim from prior knowledge, and do not return more than one claim.
For a null claim, aboutPersonId must also be null.`

// v6 = v5's classification procedure, with the anti-context instruction removed
// and reference resolution admitted in its place. The removal is what makes the
// supplied context reachable at all: sending context while instructing the
// model to ignore prior knowledge buys tokens and changes nothing.
//
// UNMEASURED against the C5 corpus. v6 inherits v5's classification text but
// not v5's measurement, and v5's own verdict was K5A-V5-RESULT-FAIL.
export const V6_CARTOGRAPHER_PROMPT = `${BASE_PROMPT}
${DURABILITY_AND_TYPE_BODY}

The source event is one turn of a conversation, and a Session context section
may be supplied. Use it to resolve what the source event is ABOUT when the
source event alone does not say: a pronoun, an ellipsis, or a bare noun phrase
that refers to something already established. Resolve reference only. Never
import a claim from the context; the claim must still be asserted by the source
event itself. A source event that merely answers a question posed in the context
states the answer, not a preference for it.

Never invent a Person ID. You may copy only an ID from the supplied candidates.
Do not return more than one claim.
For a null claim, aboutPersonId must also be null.`

export const isV3Contract = (version: string): boolean => (
  version === 'cartographer-single-claim-v3'
)

export const isClaimBlockedTopicContract = (version: string): boolean => (
  CLAIM_BLOCKED_TOPIC_EXTRACTOR_VERSIONS.includes(
    version as (typeof CLAIM_BLOCKED_TOPIC_EXTRACTOR_VERSIONS)[number],
  )
)

export const acceptsSessionContext = (version: string): boolean => (
  SESSION_CONTEXT_EXTRACTOR_VERSIONS.includes(
    version as (typeof SESSION_CONTEXT_EXTRACTOR_VERSIONS)[number],
  )
)

export const requiresUnitPhysics = (version: string): boolean => (
  CARTOGRAPHER_PHYSICS_VERSIONS.includes(
    version as (typeof CARTOGRAPHER_PHYSICS_VERSIONS)[number],
  )
)
