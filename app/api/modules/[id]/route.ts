// Module detail endpoint.
//
// GET /api/modules/:id  -- returns a single module record + manifest.

import { NextResponse } from 'next/server'
import { requireAuthResponse } from '@/lib/auth'
import { getModule } from '@/lib/modules'

export const GET = async (
  _req: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> => {
  const authResult = await requireAuthResponse()
  if (authResult instanceof Response) return authResult

  const { id } = await context.params
  if (!id) {
    return NextResponse.json(
      { error: 'Missing module id' },
      { status: 400 }
    )
  }

  const moduleRecord = await getModule(id)
  if (!moduleRecord) {
    return NextResponse.json(
      { error: `Module "${id}" not found` },
      { status: 404 }
    )
  }

  return NextResponse.json({ module: moduleRecord })
}
