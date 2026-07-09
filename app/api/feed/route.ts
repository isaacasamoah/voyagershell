import { requireAuthResponse } from '@/lib/auth'
import { getFeed, SessionAccessError } from '@/lib/messaging/feed'
import { toFeedApiEvent } from '@/lib/messaging/feed-types'
import { log } from '@/lib/debug'

export const dynamic = 'force-dynamic'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const GET = async (req: Request) => {
  const auth = await requireAuthResponse()
  if (auth instanceof Response) return auth

  const url = new URL(req.url)
  const conversationId = url.searchParams.get('conversationId')
  if (!conversationId || !uuidRegex.test(conversationId)) {
    return Response.json({ error: 'conversationId required' }, { status: 400 })
  }

  try {
    const events = await getFeed(auth, conversationId)
    return Response.json({ events: events.map(toFeedApiEvent) })
  } catch (err) {
    if (err instanceof SessionAccessError) {
      return Response.json({ error: 'session_access_denied' }, { status: 403 })
    }

    log.api('Feed fetch failed', { error: String(err), conversationId }, 'error')
    return Response.json({ error: 'could not load feed' }, { status: 500 })
  }
}
