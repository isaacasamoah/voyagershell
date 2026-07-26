import { generateObject, type LanguageModel } from 'ai'
import {
  CARTOGRAPHER_PROMPT,
  extractionSchema,
  type ExtractionObject,
} from './contract'
import type { ExtractionAttempt, ExtractionRun } from './types'

const classifyProviderFailure = (error: unknown): 'provider_failed' | 'malformed_output' => {
  const name = error instanceof Error ? error.name : ''
  return name.includes('NoObjectGenerated') || name.includes('TypeValidation')
    ? 'malformed_output'
    : 'provider_failed'
}

export const extractKnowledge = async (
  model: LanguageModel,
  attempt: ExtractionAttempt,
): Promise<ExtractionRun> => {
  const source = {
    eventId: attempt.sourceEventId,
    eventType: attempt.sourceEventType,
    actorPersonId: attempt.sourceActorId,
    content: attempt.sourceContent,
  }
  const prompt = `## Immutable source event
${JSON.stringify(source)}

## Allowed Person candidates
${JSON.stringify(attempt.candidates)}

Return the structured Cartographer result.`

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
      object: result.object as ExtractionObject,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
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
