// Pending messages for the live wire (M0.2): the caller's unseen delivery
// rows joined to their message events. The client can read delivery rows
// directly (RLS), but message CONTENT lives in knowledge_events (admin-only)
// — this route is the content bridge.

import { requireAuthResponse } from '@/lib/auth'
import { getPendingMessages } from '@/lib/messaging/deliveries'
import { log } from '@/lib/debug'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  const auth = await requireAuthResponse()
  if (auth instanceof Response) return auth

  try {
    const items = await getPendingMessages(auth)
    return Response.json({ messages: items })
  } catch (err) {
    log.api('Pending messages fetch failed', { error: String(err) }, 'error')
    return Response.json({ error: 'could not load pending messages' }, { status: 500 })
  }
}
