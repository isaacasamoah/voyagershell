import { requireAuthResponse } from '@/lib/auth'
import { getDisplayRoom } from '@/lib/messaging/room'
import { resolveSessionVoyage, SessionAccessError } from '@/lib/voyage'
import { log } from '@/lib/debug'

export const dynamic = 'force-dynamic'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const GET = async (req: Request) => {
  const auth = await requireAuthResponse()
  if (auth instanceof Response) return auth

  const conversationId = new URL(req.url).searchParams.get('conversationId')
  if (!conversationId || !uuidRegex.test(conversationId)) {
    return Response.json({ error: 'conversationId required' }, { status: 400 })
  }

  try {
    // Ownership is asserted independently of room membership. A removed person
    // may still ask what audience their own session currently has; the answer
    // is an empty room, never another person's roster.
    await resolveSessionVoyage(conversationId, auth)
    return Response.json({ room: await getDisplayRoom(conversationId) })
  } catch (error) {
    if (error instanceof SessionAccessError) {
      return Response.json({ error: 'session_access_denied' }, { status: 403 })
    }
    log.api('Room state fetch failed', { conversationId, error: String(error) }, 'error')
    return Response.json({ error: 'could not load room' }, { status: 500 })
  }
}
