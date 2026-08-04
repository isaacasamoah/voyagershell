import { generateObject, type LanguageModel } from 'ai'
import {
  HISTORICAL_CARTOGRAPHER_PROMPT,
  V3_CARTOGRAPHER_PROMPT,
  V4_CARTOGRAPHER_PROMPT,
  V5_CARTOGRAPHER_PROMPT,
  V6_CARTOGRAPHER_PROMPT,
  acceptsSessionContext,
  extractionSchema,
  historicalExtractionSchema,
  isV3Contract,
  v3ExtractionSchema,
  type AnyExtractionObject,
} from './contract'
import type {
  ExtractionAttempt,
  ExtractionRun,
  TopicBackfillUnit,
  TopicCandidate,
} from './types'
import { classifyProviderFailure } from './provider-failure'

export const buildExtractionInput = (
  attempt: ExtractionAttempt,
  topicCandidates: TopicCandidate[] = [],
): { system: string; prompt: string } => ({
  system: systemPromptFor(attempt.extractorVersion),
  prompt: promptForAttempt(
    attempt,
    topicCandidates,
    isV3Contract(attempt.extractorVersion),
    acceptsSessionContext(attempt.extractorVersion),
  ),
})

const promptForAttempt = (
  attempt: ExtractionAttempt,
  topicCandidates: TopicCandidate[],
  includeTopics: boolean,
  includeSessionContext: boolean,
): string => {
  const source = {
    eventId: attempt.sourceEventId,
    eventType: attempt.sourceEventType,
    actorPersonId: attempt.sourceActorId,
    content: attempt.sourceContent,
  }
  const historicalPrompt = `## Immutable source event
${JSON.stringify(source)}

## Allowed Person candidates
${JSON.stringify(attempt.candidates)}

Return the structured Cartographer result.`
  if (includeSessionContext) {
    if (attempt.sessionContext === null) return historicalPrompt
    return `## Immutable source event
${JSON.stringify(source)}

## Allowed Person candidates
${JSON.stringify(attempt.candidates)}

## Session context
${attempt.sessionContext}

Return the structured Cartographer result.`
  }
  if (!includeTopics) return historicalPrompt
  return `## Immutable source event
${JSON.stringify(source)}

## Allowed Person candidates
${JSON.stringify(attempt.candidates)}

## Existing topic candidates
${JSON.stringify(topicCandidates)}

Return the structured Cartographer result.`
}

// Explicit map rather than a ternary chain: with v6 current, a v5 attempt must
// still resolve to the v5 prompt, not fall through to the historical one.
const SYSTEM_PROMPT_BY_VERSION: Readonly<Record<string, string>> = {
  'cartographer-single-claim-v3': V3_CARTOGRAPHER_PROMPT,
  'cartographer-single-claim-v4': V4_CARTOGRAPHER_PROMPT,
  'cartographer-single-claim-v5': V5_CARTOGRAPHER_PROMPT,
  'cartographer-single-claim-v6': V6_CARTOGRAPHER_PROMPT,
}

const systemPromptFor = (version: string): string => (
  SYSTEM_PROMPT_BY_VERSION[version] ?? HISTORICAL_CARTOGRAPHER_PROMPT
)

const runExtraction = async (
  model: LanguageModel,
  attempt: ExtractionAttempt,
  system: string,
  prompt: string,
  schema: typeof historicalExtractionSchema | typeof v3ExtractionSchema,
): Promise<ExtractionRun> => {
  try {
    const result = await generateObject({
      model,
      system,
      messages: [{ role: 'user', content: prompt }],
      schema,
      maxOutputTokens: 1024,
    })
    return {
      kind: 'structured',
      object: result.object as AnyExtractionObject,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    }
  } catch (error) {
    return {
      kind: 'failed',
      failure: classifyProviderFailure(error),
      errorClass: error instanceof Error && error.name
        ? error.name.slice(0, 80)
        : 'unknown_provider_error',
    }
  }
}

export const extractKnowledge = async (
  model: LanguageModel,
  attempt: ExtractionAttempt,
  topicCandidates: TopicCandidate[] = [],
): Promise<ExtractionRun> => {
  const { system, prompt } = buildExtractionInput(attempt, topicCandidates)
  return runExtraction(
    model,
    attempt,
    system,
    prompt,
    isV3Contract(attempt.extractorVersion)
      ? v3ExtractionSchema
      : extractionSchema,
  )
}

export const rederiveKnowledgeUnit = async (
  model: LanguageModel,
  unit: TopicBackfillUnit,
): Promise<ExtractionRun> => {
  const prompt = `## Existing immutable KnowledgeUnit claim
${JSON.stringify({ claim: unit.claim, sourceContent: unit.sourceContent })}

Copy the existing claim exactly into claim, set aboutPersonId to null, classify
it, and return the structured Cartographer result.`
  try {
    const result = await generateObject({
      model,
      // This backfill writes a v4 topic-identity outcome. It must remain judged
      // by the frozen v4 prompt even after a later contract becomes current.
      system: V4_CARTOGRAPHER_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      schema: extractionSchema,
      maxOutputTokens: 1024,
    })
    return {
      kind: 'structured',
      object: result.object as AnyExtractionObject,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    }
  } catch (error) {
    return {
      kind: 'failed',
      failure: classifyProviderFailure(error),
      errorClass: error instanceof Error && error.name
        ? error.name.slice(0, 80)
        : 'unknown_provider_error',
    }
  }
}
