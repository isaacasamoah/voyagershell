import {
  claimSourceIngress,
  enrichNewIngress,
  IngressConflictError,
} from '@/lib/messaging/ingress'
import { runCartographer } from '@/lib/agents/cartographer'
import { log } from '@/lib/debug'
import type { AddressResult } from '@/lib/messaging/address'
import type { RoomGate } from './room-turn'
import type { HarnessHost, TurnContext, TurnResult } from './types'

export interface TurnIngressDecision {
  result: TurnResult | null
  outcome: Awaited<ReturnType<typeof claimSourceIngress>> | null
}

const CONFLICT_NOTICE =
  "That didn't send — the same message id arrived with different text. Try sending it again."

/**
 * Claims the source, audience, graph identity and delivery outbox atomically.
 * Replayed claims stop before enrichment or the primary model call.
 */
export const claimTurnIngress = async (
  ctx: TurnContext,
  host: HarnessHost,
  gate: RoomGate,
  queryText: string,
  address: AddressResult,
): Promise<TurnIngressDecision> => {
  const { userId, conversationId, voyageSlug } = ctx
  if (!conversationId || !queryText || ctx.autoSent) {
    return { result: null, outcome: null }
  }

  const request = {
    userId,
    sessionId: conversationId,
    voyageSlug,
    // Without a client message ID, separate sends in one session share a key.
    clientMessageId: ctx.clientMessageId ?? conversationId,
    content: queryText,
    isAside: address.mode === 'aside',
    room: gate.room,
    voyageMembers: gate.voyageMembers,
    senderDisplayName: gate.senderDisplayName,
  }

  try {
    const ingress = await claimSourceIngress(request)
    if (ingress.status === 'replayed') {
      return { result: { kind: 'empty' }, outcome: ingress }
    }
    host.defer(runCartographer({
      userId,
      sourceEventId: ingress.eventId,
    }))
    host.defer(enrichNewIngress(request, ingress))
    return { result: null, outcome: ingress }
  } catch (error) {
    if (error instanceof IngressConflictError) {
      log.api('Ingress claim conflict — same key, different payload', {
        conversationId,
      }, 'warn')
      return {
        result: { kind: 'text', text: CONFLICT_NOTICE },
        outcome: null,
      }
    }
    throw error
  }
}
