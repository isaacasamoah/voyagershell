import { z } from 'zod'

export const CARTOGRAPHER_EXTRACTOR_VERSION = 'cartographer-single-claim-v1'

export const extractionSchema = z.object({
  claim: z.string().trim().min(1).nullable(),
  aboutPersonId: z.string().uuid().nullable(),
  knowledgeType: z.enum(['domain', 'operational', 'preference']),
  attentionScore: z.number().min(0).max(1),
  contextSnippet: z.string().trim().min(1),
}).strict().superRefine((value, context) => {
  if (value.claim === null && value.aboutPersonId !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'about_requires_claim',
      path: ['aboutPersonId'],
    })
  }
})

export type ExtractionObject = z.infer<typeof extractionSchema>

export const CARTOGRAPHER_PROMPT = `You are Voyager's Cartographer.

Judge exactly one immutable human-authored source event. Return one structured
object with:
- claim: one durable fact stated by the source, or null when there is no durable claim;
- aboutPersonId: one supplied Person ID when the claim is explicitly about that
  person, otherwise null;
- knowledgeType: domain, operational, or preference;
- attentionScore: 0 to 1;
- contextSnippet: a concise declarative restatement useful for retrieval.

Never invent a Person ID. You may copy only an ID from the supplied candidates.
Do not infer a claim from prior knowledge, and do not return more than one claim.
For a null claim, aboutPersonId must also be null.`
