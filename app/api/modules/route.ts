// Module management API.
//
// GET    /api/modules           -- list catalog + caller's installs
// POST   /api/modules           -- install a module (body: moduleId, voyageSlug?, config?)
// DELETE /api/modules?id=<uuid> -- uninstall a user_modules row owned by caller
//
// Voyage-scoped installs are captain-only (enforced inside installModule()).

import { NextResponse } from 'next/server'
import { requireAuthResponse } from '@/lib/auth'
import {
  listModules,
  installModule,
  uninstallModule,
  listUserInstalls,
} from '@/lib/modules'
import { log } from '@/lib/debug'

// -----------------------------------------------------------------------------
// GET -- catalog + caller's installs
// -----------------------------------------------------------------------------

export const GET = async (): Promise<Response> => {
  const authResult = await requireAuthResponse()
  if (authResult instanceof Response) return authResult
  const userId = authResult

  const [catalog, installed] = await Promise.all([
    listModules(),
    listUserInstalls(userId),
  ])

  return NextResponse.json({ catalog, installed })
}

// -----------------------------------------------------------------------------
// POST -- install a module
// -----------------------------------------------------------------------------

interface PostBody {
  moduleId?: string
  voyageSlug?: string | null
  config?: Record<string, unknown>
}

export const POST = async (req: Request): Promise<Response> => {
  const authResult = await requireAuthResponse()
  if (authResult instanceof Response) return authResult
  const userId = authResult

  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    )
  }

  const moduleId = body.moduleId
  if (!moduleId || typeof moduleId !== 'string') {
    return NextResponse.json(
      { error: 'moduleId is required' },
      { status: 400 }
    )
  }

  const result = await installModule({
    userId,
    moduleId,
    voyageSlug: body.voyageSlug ?? null,
    config: body.config,
  })

  if (!result.ok) {
    log.api(
      'POST /api/modules install rejected',
      { moduleId, reason: result.reason },
      'warn'
    )
    return NextResponse.json(
      { error: result.reason },
      { status: result.status }
    )
  }

  return NextResponse.json({ installed: result.installed }, { status: 201 })
}

// -----------------------------------------------------------------------------
// DELETE -- uninstall
// -----------------------------------------------------------------------------

export const DELETE = async (req: Request): Promise<Response> => {
  const authResult = await requireAuthResponse()
  if (authResult instanceof Response) return authResult
  const userId = authResult

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return NextResponse.json(
      { error: 'Missing required query param: id' },
      { status: 400 }
    )
  }

  const result = await uninstallModule({ userId, userModuleId: id })
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.status }
    )
  }

  return NextResponse.json({ ok: true, id: result.id })
}
