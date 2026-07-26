// The ingress step of a turn — the point at which a person's message becomes a
// fact, and the last point at which nothing has happened yet.
//
// Auth and audience are settled before this runs. From here the turn has
// effects, so the claim is taken FIRST — actor, transport, client message id and
// payload hash — and the audience, the event, its graph identity and the
// delivery outbox all commit in that same transaction. A retry of the same
// client message cannot get past the claim, so it cannot fan out twice, write a
// second event, or reach the model a second time.

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

// What a person sees when the same send arrives carrying different words. The
// claim rejected it and wrote nothing, so the honest thing to say is that this
// one did not land — not to quietly show them the earlier message as if it had.
const CONFLICT_NOTICE =
  "That didn't send — the same message id arrived with different text. Try sending it again."

/** The claimed source event, or a terminal result when the turn must stop. */
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
    // A client that sends no id of its own gets the session as its key. That is
    // honest rather than clever: it dedupes a reconnect within one session and
    // says nothing about sends it cannot distinguish.
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
