import { generateObject, type LanguageModel } from 'ai'
import {
  CARTOGRAPHER_PROMPT,
  HISTORICAL_CARTOGRAPHER_PROMPT,
  V3_CARTOGRAPHER_PROMPT,
  extractionSchema,
  historicalExtractionSchema,
  isCurrentContract,
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

export const extractKnowledge = async (
  model: LanguageModel,
  attempt: ExtractionAttempt,
  topicCandidates: TopicCandidate[] = [],
): Promise<ExtractionRun> => {
  const source = {
    eventId: attempt.sourceEventId,
    eventType: attempt.sourceEventType,
    actorPersonId: attempt.sourceActorId,
    content: attempt.sourceContent,
  }
  const v3 = isV3Contract(attempt.extractorVersion)
  const current = isCurrentContract(attempt.extractorVersion)
  const historicalPrompt = `## Immutable source event
${JSON.stringify(source)}

## Allowed Person candidates
${JSON.stringify(attempt.candidates)}

Return the structured Cartographer result.`
  const prompt = v3 ? `## Immutable source event
${JSON.stringify(source)}

## Allowed Person candidates
${JSON.stringify(attempt.candidates)}

## Existing topic candidates
${JSON.stringify(topicCandidates)}

Return the structured Cartographer result.` : historicalPrompt

  try {
    const result = await generateObject({
      model,
      system: v3
        ? V3_CARTOGRAPHER_PROMPT
        : current ? CARTOGRAPHER_PROMPT : HISTORICAL_CARTOGRAPHER_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      schema: v3
        ? v3ExtractionSchema
        : current ? extractionSchema : historicalExtractionSchema,
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
      system: CARTOGRAPHER_PROMPT,
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
