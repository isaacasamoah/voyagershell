import { NextResponse } from 'next/server'
import { requireAuthResponse } from '@/lib/auth'
import { sharePrivateVoyagerReply } from '@/lib/messaging/share'
import { resolveSessionVoyage, SessionAccessError } from '@/lib/voyage'

interface ShareBody {
  sourceEventId?: string
  conversationId?: string
}

export const POST = async (req: Request) => {
  const auth = await requireAuthResponse()
  if (auth instanceof Response) return auth

  let body: ShareBody
  try {
    body = await req.json() as ShareBody
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  if (!body.sourceEventId || !body.conversationId) {
    return NextResponse.json({ error: 'sourceEventId_and_conversationId_required' }, { status: 400 })
  }

  try {
    const voyageSlug = await resolveSessionVoyage(body.conversationId, auth)
    const result = await sharePrivateVoyagerReply({
      sourceEventId: body.sourceEventId,
      conversationId: body.conversationId,
      userId: auth,
      voyageSlug,
    })
    if (!result.ok) {
      const status = result.code === 'source_not_shareable' ? 403 : result.code === 'room_has_no_audience' ? 409 : 500
      return NextResponse.json({ error: result.code }, { status })
    }
    return NextResponse.json({ eventId: result.eventId }, { status: 201 })
  } catch (error) {
    if (error instanceof SessionAccessError) {
      return NextResponse.json({ error: 'session_access_denied' }, { status: 403 })
    }
    return NextResponse.json({ error: 'share_failed' }, { status: 500 })
  }
}
