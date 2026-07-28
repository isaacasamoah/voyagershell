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

export type CartographerRunResult =
  | { kind: 'no_job' }
  | { kind: 'model_identity_unavailable' }
  | { kind: 'completed'; outcome: string; sourceEventId: string; unitId: string | null }
  | { kind: 'failed'; error: string }

// Null means "not priced here", never "free". Only Anthropic rates are known
// to this build, and a provider that reports no usage cannot be costed at all.
const meteredCost = (
  provider: string,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): number | null => provider === 'anthropic'
    && inputTokens !== undefined && outputTokens !== undefined
  ? (inputTokens * 3 + outputTokens * 15) / 1_000_000
  : null

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
    const completion = await completeExtractionAttempt({
      attempt,
      result: object.claim === null ? 'no_claim' : 'succeeded',
      rawOutput: object,
      claim: object.claim ?? undefined,
      aboutPersonId: object.aboutPersonId ?? undefined,
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
      meteredCostUsd: meteredCost(provider, extracted.inputTokens, extracted.outputTokens),
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
