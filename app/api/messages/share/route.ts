import { NextResponse } from 'next/server'
import { requireAuthResponse } from '@/lib/auth'
import { sharePrivateVoyagerReply } from '@/lib/messaging/share'

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
    const result = await sharePrivateVoyagerReply({
      sourceEventId: body.sourceEventId,
      conversationId: body.conversationId,
      userId: auth,
    })
    if (!result.ok) {
      const status = result.code === 'room_has_no_audience'
        ? 409
        : result.code === 'write_failed'
          ? 500
          : 403
      return NextResponse.json({ error: result.code }, { status })
    }
    return NextResponse.json(
      { eventId: result.eventId, status: result.status },
      { status: result.status === 'created' ? 201 : 200 },
    )
  } catch {
    return NextResponse.json({ error: 'share_failed' }, { status: 500 })
  }
}
