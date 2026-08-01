import { generateObject, type LanguageModel } from 'ai'
import {
  TOPIC_MATCHER_PROMPT,
  topicMatcherSchema,
} from './contract'
import type {
  ExtractionFailureKind,
  TopicCandidate,
  TopicMatcherRun,
} from './types'
import { classifyProviderFailure } from './provider-failure'

export type TopicMatcherResult =
  | TopicMatcherRun
  | { kind: 'failed'; failure: ExtractionFailureKind; errorClass: string }

export const matchKnowledgeTopics = async (
  model: LanguageModel,
  claim: string,
  candidates: TopicCandidate[],
): Promise<TopicMatcherResult> => {
  const prompt = `## Immutable KnowledgeUnit claim
${JSON.stringify({ claim })}

## Authorized candidate topics, nearest first
${JSON.stringify(candidates.map(({
    topicId,
    label,
    representativeClaim,
  }) => ({ topicId, label, representativeClaim })))}

Return the structured topic filings.`
  try {
    const result = await generateObject({
      model,
      system: TOPIC_MATCHER_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      schema: topicMatcherSchema,
      maxOutputTokens: 512,
    })
    return {
      kind: 'structured',
      topics: result.object.topics,
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
