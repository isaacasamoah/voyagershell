// Connect a ChatGPT/Codex subscription as a brain connection.
// The connect script (scripts/connect-codex.mjs) POSTs the local `codex login`
// tokens here over an authenticated session. Tokens are encrypted at rest and
// never returned to any client.

import { requireAuthResponse } from '@/lib/auth'
import { upsertCodexConnection, getActiveCodexConnection, readCodexMetadata } from '@/lib/models'
import { log } from '@/lib/debug'

interface ConnectBody {
  access_token?: string
  refresh_token?: string
  id_token?: string
}

export const POST = async (req: Request) => {
  const auth = await requireAuthResponse()
  if (auth instanceof Response) return auth
  const userId = auth

  let body: ConnectBody
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.access_token || !body.refresh_token) {
    return Response.json(
      { error: 'access_token and refresh_token are required' },
      { status: 400 },
    )
  }

  const meta = readCodexMetadata(body.access_token, body.id_token)
  if (!meta.accountId) {
    return Response.json(
      { error: 'Could not read chatgpt-account-id from token — is this a subscription login?' },
      { status: 422 },
    )
  }

  try {
    await upsertCodexConnection({
      userId,
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      idToken: body.id_token,
    })
  } catch (err) {
    log.api('Failed to store codex connection', { error: String(err) }, 'error')
    return Response.json({ error: 'Failed to store connection' }, { status: 500 })
  }

  return Response.json({
    connected: true,
    provider: 'openai',
    kind: 'subscription_oauth',
    plan_type: meta.planType ?? null,
    expires_at: meta.expiresAt?.toISOString() ?? null,
  })
}

export const GET = async () => {
  const auth = await requireAuthResponse()
  if (auth instanceof Response) return auth
  const userId = auth

  const cred = await getActiveCodexConnection(userId).catch(() => null)
  return Response.json({ connected: cred !== null, provider: 'openai' })
}
