// Receipt stamping (M0.2): the client reports delivered/seen moments.
// Server-side via admin so the stamping logic stays in one place; recipient
// ownership is enforced here (and by the DB trigger, receipts only move
// forward — a stamped timestamp can never be cleared).

import { requireAuthResponse } from '@/lib/auth'
import { stampReceipts } from '@/lib/messaging/deliveries'
import { log } from '@/lib/debug'

export const dynamic = 'force-dynamic'

export const POST = async (req: Request) => {
  const auth = await requireAuthResponse()
  if (auth instanceof Response) return auth

  let body: { delivery_ids?: string[]; delivered?: boolean; seen?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!Array.isArray(body.delivery_ids) || body.delivery_ids.length === 0) {
    return Response.json({ error: 'delivery_ids required' }, { status: 400 })
  }
  const deliveryIds = Array.from(
    new Set(body.delivery_ids.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  ).slice(0, 100)
  if (deliveryIds.length === 0) {
    return Response.json({ error: 'delivery_ids required' }, { status: 400 })
  }
  if (!body.delivered && !body.seen) {
    return Response.json({ error: 'nothing to stamp' }, { status: 400 })
  }

  try {
    const result = await stampReceipts(auth, deliveryIds, {
      delivered: Boolean(body.delivered),
      seen: Boolean(body.seen),
    })
    return Response.json({ ok: true, stamped: result.updatedIds.length, ids: result.updatedIds })
  } catch (err) {
    log.api('Receipt stamp failed', { error: String(err) }, 'error')
    return Response.json({ error: 'could not stamp receipts' }, { status: 500 })
  }
}
