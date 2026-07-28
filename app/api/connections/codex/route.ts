// Read the authenticated user's device-flow Codex connection status.
// Connection creation stays on the server-owned device start/poll routes.

import { requireAuthResponse } from '@/lib/auth'
import { getActiveCodexConnection } from '@/lib/models'

export const GET = async () => {
  const auth = await requireAuthResponse()
  if (auth instanceof Response) return auth
  const userId = auth

  const cred = await getActiveCodexConnection(userId).catch(() => null)
  return Response.json({ connected: cred !== null, provider: 'openai' })
}
