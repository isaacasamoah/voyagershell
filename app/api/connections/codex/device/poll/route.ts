// One poll attempt for a device-code connect. On approval, exchanges the
// server-minted PKCE pair for tokens and stores them encrypted under the
// caller's account — the browser only ever sees { connected: true }.

import { requireAuthResponse } from '@/lib/auth'
import { pollDeviceAuth, upsertCodexConnection, readCodexMetadata } from '@/lib/models'
import { log } from '@/lib/debug'

export const POST = async (req: Request) => {
  const auth = await requireAuthResponse()
  if (auth instanceof Response) return auth
  const userId = auth

  let body: { device_auth_id?: string; user_code?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.device_auth_id || !body.user_code) {
    return Response.json({ error: 'device_auth_id and user_code are required' }, { status: 400 })
  }

  try {
    const result = await pollDeviceAuth(body.device_auth_id, body.user_code)
    if (result.status === 'pending') return Response.json({ status: 'pending' })

    await upsertCodexConnection({
      userId,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      idToken: result.tokens.idToken,
    })
    const meta = readCodexMetadata(result.tokens.accessToken, result.tokens.idToken)
    return Response.json({ status: 'connected', plan_type: meta.planType ?? null })
  } catch (err) {
    log.api('Device auth poll failed', { error: String(err) }, 'error')
    return Response.json(
      { error: 'the connection attempt hit a snag — start again from the code screen' },
      { status: 502 },
    )
  }
}
