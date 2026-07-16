// Deterministic room-invite response — the inline knock's Join/Decline buttons
// POST here. Acceptance is code-attested (Principle 1: code owns membership
// structure), NOT inferred by the model. The `respond_to_room_invite` tool
// remains for conversational decline; the button is the primary accept path.

import { requireAuthResponse } from '@/lib/auth'
import { enterActiveRoom, respondToRoomInvite } from '@/lib/messaging/invites'
import { log } from '@/lib/debug'

export const dynamic = 'force-dynamic'

export const POST = async (req: Request) => {
  const auth = await requireAuthResponse()
  if (auth instanceof Response) return auth

  let body: { conversationId?: string; accept?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null
  if (!conversationId) {
    return Response.json({ error: 'conversationId required' }, { status: 400 })
  }
  const accept = body.accept === true

  try {
    const response = await respondToRoomInvite(conversationId, auth, accept)
    if (response.responded) return Response.json({ ok: true, ...response })

    // Accepting from a fresh session where membership is already active —
    // no pending invite to flip, so just re-enter the room.
    if (accept) {
      const entered = await enterActiveRoom(conversationId, auth)
      if (entered.entered) {
        return Response.json({ ok: true, responded: true, accepted: true, spaceId: entered.spaceId })
      }
    }

    return Response.json({ ok: true, responded: false, reason: 'no_pending_invite' })
  } catch (err) {
    log.api('Room invite response failed', { error: String(err), conversationId }, 'error')
    return Response.json({ error: 'could not respond to invite' }, { status: 500 })
  }
}
