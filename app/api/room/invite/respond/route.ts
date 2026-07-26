// Deterministic room-invite response — the inline knock's Join/Decline buttons
// POST here. Acceptance is code-attested (Principle 1: code owns membership
// structure), NOT inferred by the model. The displayed knock supplies the exact
// room identity; there is no conversational "latest invite" fallback.

import { requireAuthResponse } from '@/lib/auth'
import { announceJoin } from '@/lib/messaging/announce-join'
import { respondToRoomInvite } from '@/lib/messaging/invites'
import { log } from '@/lib/debug'

export const dynamic = 'force-dynamic'
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const POST = async (req: Request) => {
  const auth = await requireAuthResponse()
  if (auth instanceof Response) return auth

  let body: { conversationId?: string; spaceId?: string; accept?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null
  const spaceId = typeof body.spaceId === 'string' ? body.spaceId : null
  if (!conversationId || !uuidRegex.test(conversationId) || !spaceId || !uuidRegex.test(spaceId)) {
    return Response.json({ error: 'valid conversationId and spaceId required' }, { status: 400 })
  }
  const accept = body.accept === true

  try {
    const response = await respondToRoomInvite(conversationId, auth, accept, spaceId)
    if (response.responded) {
      // Genuine invited→active transition — tell the rest of the room over the
      // realtime lane so the join lands instantly, not on their next turn.
      if (response.accepted && response.transition === 'accepted') {
        await announceJoin(conversationId, response.spaceId, auth)
      }
      return Response.json({ ok: true, ...response })
    }
    return Response.json({ ok: false, responded: false, reason: response.reason }, { status: 409 })
  } catch (err) {
    log.api('Room invite response failed', { error: String(err), conversationId }, 'error')
    return Response.json({ error: 'could not respond to invite' }, { status: 500 })
  }
}
