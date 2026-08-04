import { log } from '@/lib/debug/logger'
import { resolveUserModelWithMeta } from '@/lib/models'
import { upsertPersonSessionIndex } from '@/lib/knowledge/lifecycle/session-index'
import { extractKnowledge } from './cartographer/extractor'
import {
  beginExtractionAttempt,
  completeExtractionAttempt,
} from './cartographer/jobs'
import type {
  CartographerPayload,
  ExtractionCompletion,
  TopicCandidate,
} from './cartographer/types'
import { toVectorString } from './cartographer/embeddings'
import {
  isClaimBlockedTopicContract,
  isV3Contract,
  requiresUnitPhysics,
  type ExtractionObject,
  type V3ExtractionObject,
} from './cartographer/contract'
import {
  embedCartographerText,
  embedLegacyTopicInputs,
  findTopicCandidates,
  type LegacyTopicInput,
} from './cartographer/topics'
import { completeMatchedExtraction } from './cartographer/topic-pipeline'
import { runRelationPipeline } from './cartographer/relation-pipeline'

export type CartographerRunResult =
  | { kind: 'no_job' }
  | { kind: 'model_identity_unavailable' }
  | { kind: 'completed'; outcome: string; sourceEventId: string; unitId: string | null }
  | { kind: 'relation_completed'; outcome: string; unitId: string; edgeIds: string[] }
  | { kind: 'failed'; error: string }

const embeddingErrorClass = (error: unknown): string => (
  error instanceof Error && error.name
    ? error.name.slice(0, 80)
    : 'embedding_provider_error'
)

export const runCartographer = async (
  payload: CartographerPayload,
): Promise<CartographerRunResult> => {
  const { userId, sourceEventId } = payload
  const startTime = Date.now()
  log.agent('Cartographer job requested', { sourceEventId, userId })

  try {
    const resolved = await resolveUserModelWithMeta(
      { task: 'classification', quality: 'balanced' },
      userId,
    )
    const provider = typeof resolved.model === 'object'
      && resolved.model !== null
      && 'provider' in resolved.model
      && typeof resolved.model.provider === 'string'
      ? resolved.model.provider
      : ''
    const modelId = typeof resolved.model === 'object'
      && resolved.model !== null
      && 'modelId' in resolved.model
      && typeof resolved.model.modelId === 'string'
      ? resolved.model.modelId
      : ''
    if (!provider || !modelId) {
      log.agent('Cartographer model identity unavailable', { sourceEventId }, 'error')
      return { kind: 'model_identity_unavailable' }
    }

    let relationResult: Awaited<ReturnType<typeof runRelationPipeline>> = {
      kind: 'no_job',
    }
    let relationError: string | null = null
    try {
      relationResult = await runRelationPipeline({
        userId,
        model: resolved.model,
        modelProvider: provider,
        modelId,
        resolverLabel: resolved.label,
      })
    } catch (error) {
      relationError = error instanceof Error ? error.message : String(error)
      log.agent('Relation drain failed', { userId, error: relationError }, 'error')
    }

    const attempt = await beginExtractionAttempt({
      userId,
      sourceEventId,
      modelProvider: provider,
      modelId,
      resolverLabel: resolved.label,
    })
    if (!attempt) {
      if (relationResult.kind === 'completed') {
        return {
          kind: 'relation_completed',
          outcome: relationResult.outcome,
          unitId: relationResult.unitId,
          edgeIds: relationResult.edgeIds,
        }
      }
      if (relationError) return { kind: 'failed', error: relationError }
      return { kind: 'no_job' }
    }

    let topicCandidates: TopicCandidate[] = []
    if (isV3Contract(attempt.extractorVersion)) {
      try {
        const sourceEmbedding = await embedCartographerText(attempt.sourceContent)
        topicCandidates = await findTopicCandidates(
          attempt.extractorVersion,
          attempt.knowledgeAudienceId,
          sourceEmbedding,
        )
      } catch (error) {
        const completion = await completeExtractionAttempt({
          attempt,
          result: 'provider_failed',
          errorClass: embeddingErrorClass(error),
        })
        return {
          kind: 'completed', outcome: completion.outcome,
          sourceEventId: attempt.sourceEventId, unitId: completion.unitId,
        }
      }
    }
    const extracted = await extractKnowledge(resolved.model, attempt, topicCandidates)
    if (extracted.kind === 'failed') {
      const completion = await completeExtractionAttempt({
        attempt,
        result: extracted.failure,
        errorClass: extracted.errorClass,
      })
      return {
        kind: 'completed',
        outcome: completion.outcome,
        sourceEventId: attempt.sourceEventId,
        unitId: completion.unitId,
      }
    }

    const object = extracted.object
    let embedding: string | undefined
    let embeddingVector: number[] | undefined
    let topicInputs: LegacyTopicInput[] | undefined
    if (object.claim !== null && requiresUnitPhysics(attempt.extractorVersion)) {
      try {
        embeddingVector = await embedCartographerText(object.claim)
        embedding = toVectorString(embeddingVector)
        if (isV3Contract(attempt.extractorVersion)) {
          topicInputs = await embedLegacyTopicInputs(
            (object as V3ExtractionObject).topics,
          )
        }
      } catch (error) {
        const completion = await completeExtractionAttempt({
          attempt,
          result: 'provider_failed',
          errorClass: embeddingErrorClass(error),
        })
        return {
          kind: 'completed', outcome: completion.outcome,
          sourceEventId: attempt.sourceEventId, unitId: completion.unitId,
        }
      }
    }
    let inputTokens = extracted.inputTokens
    let outputTokens = extracted.outputTokens
    let completion: ExtractionCompletion
    if (isClaimBlockedTopicContract(attempt.extractorVersion)
      && object.claim !== null
      && embedding
      && embeddingVector) {
      const matched = await completeMatchedExtraction({
        model: resolved.model,
        attempt,
        object: object as ExtractionObject,
        embedding,
        embeddingVector,
        extractionUsage: { inputTokens, outputTokens },
      })
      completion = matched.completion
      if (matched.kind === 'completed') {
        inputTokens = matched.usage.inputTokens
        outputTokens = matched.usage.outputTokens
      }
    } else {
      completion = await completeExtractionAttempt({
        attempt,
        result: object.claim === null ? 'no_claim' : 'succeeded',
        rawOutput: isClaimBlockedTopicContract(attempt.extractorVersion)
          ? { ...object, topics: [] }
          : object,
        claim: object.claim ?? undefined,
        aboutPersonId: object.aboutPersonId ?? undefined,
        knowledgeType: requiresUnitPhysics(attempt.extractorVersion)
          ? object.knowledgeType
          : undefined,
        attentionScore: requiresUnitPhysics(attempt.extractorVersion)
          ? object.attentionScore
          : undefined,
        embedding,
        topicInputs: isClaimBlockedTopicContract(attempt.extractorVersion)
          ? [] : topicInputs,
        topicCandidateSnapshot: isClaimBlockedTopicContract(attempt.extractorVersion)
          ? [] : undefined,
        inputTokens,
        outputTokens,
      })
    }
    if (completion.outcome === 'succeeded' || completion.outcome === 'no_claim') {
      if (attempt.sourceSessionId) {
        await upsertPersonSessionIndex(attempt.sourceActorId, attempt.sourceSessionId, 1)
      }
    }

    log.agent('Cartographer job complete', {
      sourceEventId: attempt.sourceEventId,
      extractorVersion: attempt.extractorVersion,
      attemptNumber: attempt.attemptNumber,
      outcome: completion.outcome,
      provider,
      modelId,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - startTime,
    })
    return {
      kind: 'completed',
      outcome: completion.outcome,
      sourceEventId: attempt.sourceEventId,
      unitId: completion.unitId,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.agent('Cartographer failed', {
      sourceEventId,
      error: message,
      durationMs: Date.now() - startTime,
    }, 'error')
    return { kind: 'failed', error: message }
  }
}
