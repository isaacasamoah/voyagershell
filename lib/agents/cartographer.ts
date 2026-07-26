// Cartographer maps the territory as it is explored. Stage 1 classifies new
// ledger events; Stage 2 connects canonical graph identities. Errors stay
// contained because the agent is fire-and-forget from the turn path.

import { log } from '@/lib/debug/logger'
import type { ToolContext } from '@/lib/retrieval/tool-types'
import { applyEnrichments } from './cartographer/apply'
import { checkPreferenceSuperseding } from './cartographer/preference-superseding'
import { processRetrievalFeedback } from './cartographer/retrieval-feedback'
import { applySessionDecay, upsertSessionIndex } from './cartographer/session-decay'
import { loadUnenrichedEvents } from './cartographer/source'
import { runStage1 } from './cartographer/stage1'
import { runStage2 } from './cartographer/stage2'
import type { CartographerPayload } from './cartographer/types'
import { buildEnrichmentWindow } from './cartographer/window'

export const runCartographer = async (payload: CartographerPayload): Promise<void> => {
  const { sessionId, userId, voyageSlug } = payload
  const startTime = Date.now()
  log.agent('Cartographer triggered', { sessionId, userId })

  try {
    const events = await loadUnenrichedEvents(sessionId, userId)
    if (events.length === 0) {
      log.agent('No unenriched events found, skipping', { sessionId })
      return
    }

    const transcript = await buildEnrichmentWindow(
      sessionId,
      events[0].source_created_at,
      userId,
      voyageSlug,
    )
    if (!transcript) {
      log.agent('No transcript available, skipping', { sessionId })
      return
    }

    log.agent('Running Stage 1', { eventCount: events.length })
    const assessments = await runStage1(transcript, events, userId)
    log.agent('Stage 1 complete', { assessmentCount: assessments.length })

    const toolContext: ToolContext = { userId, voyageSlug, conversationId: sessionId }
    log.agent('Running Stage 2', { assessmentCount: assessments.length })
    const connections = await runStage2(assessments, toolContext)
    log.agent('Stage 2 complete', { connectionCount: connections.length })

    await applyEnrichments(assessments, events)
    await upsertSessionIndex(sessionId, userId, events.length)

    const decayResult = await applySessionDecay(userId, sessionId)
    log.agent('Decay applied', decayResult)

    const supersededCount = await checkPreferenceSuperseding(assessments, userId)
    if (supersededCount > 0) log.agent('Preferences superseded', { count: supersededCount })

    const feedbackResult = await processRetrievalFeedback(userId)
    if (feedbackResult.promoted > 0) log.agent('Retrieval promotions', feedbackResult)

    log.agent('Cartographer complete', {
      sessionId,
      events: events.length,
      assessments: assessments.length,
      connections: connections.length,
      decayed: decayResult.decayed,
      superseded: supersededCount,
      promoted: feedbackResult.promoted,
      durationMs: Date.now() - startTime,
    })
  } catch (error) {
    log.agent('Cartographer failed', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    }, 'error')
  }
}
