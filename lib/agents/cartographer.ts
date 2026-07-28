import { log } from '@/lib/debug/logger'
import { resolveUserModelWithMeta } from '@/lib/models'
import { applyEnrichments } from './cartographer/apply'
import { checkPreferenceSuperseding } from './cartographer/preference-superseding'
import { processRetrievalFeedback } from './cartographer/retrieval-feedback'
import { applySessionDecay, upsertSessionIndex } from './cartographer/session-decay'
import { extractKnowledge } from './cartographer/extractor'
import {
  beginExtractionAttempt,
  completeExtractionAttempt,
} from './cartographer/jobs'
import type { CartographerPayload } from './cartographer/types'
import { getOpenAI, toVectorString } from './cartographer/embeddings'
import { CARTOGRAPHER_EXTRACTOR_VERSION } from './cartographer/contract'

export type CartographerRunResult =
  | { kind: 'no_job' }
  | { kind: 'model_identity_unavailable' }
  | { kind: 'completed'; outcome: string; sourceEventId: string; unitId: string | null }
  | { kind: 'failed'; error: string }

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

    const attempt = await beginExtractionAttempt({
      userId,
      sourceEventId,
      modelProvider: provider,
      modelId,
      resolverLabel: resolved.label,
    })
    if (!attempt) {
      return { kind: 'no_job' }
    }

    const extracted = await extractKnowledge(resolved.model, attempt)
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
    if (object.claim !== null && attempt.extractorVersion === CARTOGRAPHER_EXTRACTOR_VERSION) {
      try {
        const response = await getOpenAI().embeddings.create({
          model: 'text-embedding-3-small',
          input: object.claim,
          dimensions: 1536,
        })
        embedding = toVectorString(response.data[0].embedding)
      } catch (error) {
        const completion = await completeExtractionAttempt({
          attempt,
          result: 'provider_failed',
          errorClass: error instanceof Error ? error.name.slice(0, 80) : 'embedding_provider_error',
        })
        return {
          kind: 'completed', outcome: completion.outcome,
          sourceEventId: attempt.sourceEventId, unitId: completion.unitId,
        }
      }
    }
    const completion = await completeExtractionAttempt({
      attempt,
      result: object.claim === null ? 'no_claim' : 'succeeded',
      rawOutput: object,
      claim: object.claim ?? undefined,
      aboutPersonId: object.aboutPersonId ?? undefined,
      knowledgeType: object.knowledgeType,
      attentionScore: object.attentionScore,
      embedding,
      inputTokens: extracted.inputTokens,
      outputTokens: extracted.outputTokens,
    })
    if (completion.outcome === 'succeeded' || completion.outcome === 'no_claim') {
      const assessment = {
        eventId: attempt.sourceEventId,
        knowledgeType: object.knowledgeType,
        attentionScore: object.attentionScore,
        contextSnippet: object.contextSnippet,
      }
      await applyEnrichments([assessment], [{
        event_id: attempt.sourceEventId,
        content: attempt.sourceContent,
        source_created_at: '',
      }])
      if (attempt.sourceSessionId) {
        await upsertSessionIndex(attempt.sourceSessionId, attempt.sourceActorId, 1)
        await applySessionDecay(attempt.sourceActorId, attempt.sourceSessionId)
      }
      await checkPreferenceSuperseding([assessment], attempt.sourceActorId)
      await processRetrievalFeedback(attempt.sourceActorId)
    }

    log.agent('Cartographer job complete', {
      sourceEventId: attempt.sourceEventId,
      extractorVersion: attempt.extractorVersion,
      attemptNumber: attempt.attemptNumber,
      outcome: completion.outcome,
      provider,
      modelId,
      inputTokens: extracted.inputTokens,
      outputTokens: extracted.outputTokens,
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
