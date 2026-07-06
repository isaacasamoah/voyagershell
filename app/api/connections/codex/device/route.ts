// Start a device-code connect: returns the code the user enters at OpenAI's
// verification page. The device_auth_id/user_code pair is safe to hand to the
// authenticated client — it grants nothing until the user approves on
// openai.com, and the token exchange only ever happens server-side (poll route).

import { requireAuthResponse } from '@/lib/auth'
import { startDeviceAuth } from '@/lib/models'
import { log } from '@/lib/debug'

export const POST = async () => {
  const auth = await requireAuthResponse()
  if (auth instanceof Response) return auth

  try {
    const start = await startDeviceAuth()
    return Response.json({
      device_auth_id: start.deviceAuthId,
      user_code: start.userCode,
      interval: start.interval,
      verification_url: start.verificationUrl,
    })
  } catch (err) {
    log.api('Device auth start failed', { error: String(err) }, 'error')
    return Response.json(
      { error: "couldn't reach OpenAI to start the connection — try again in a moment" },
      { status: 502 },
    )
  }
}
