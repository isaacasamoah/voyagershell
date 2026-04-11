// POST /api/modules/forge
//
// Initiate the Voyager Forge conversation. The user supplies a natural-
// language description of the module they want; Forge uses the user's BYO
// reasoning key (Slice 1) to generate a draft ManifestManifest.
//
// DRAFT MANIFESTS ARE ADVISORY ONLY. This route does NOT write to the
// `modules` or `user_modules` tables. The caller gets a draft back in the
// response and MUST explicitly POST to /api/modules to install it. There
// is no auto-install path. This is deliberate: Forge output is reviewed
// before activation (see Slice 6 review notes).

import { NextResponse } from 'next/server'
import { requireAuthResponse } from '@/lib/auth'
import { designModule } from '@/lib/modules/forge'
import { NO_KEY_ERROR } from '@/lib/keys'
import { log } from '@/lib/debug'

interface PostBody {
  description?: string
  voyageSlug?: string
  context?: string
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

  const description = body.description
  if (!description || typeof description !== 'string') {
    return NextResponse.json(
      { error: 'description is required' },
      { status: 400 }
    )
  }

  const result = await designModule({
    description,
    userId,
    voyageSlug: body.voyageSlug,
    context: body.context,
  })

  if (!result.ok) {
    if (result.error === 'no_reasoning_key') {
      // Match the chat route's NO_KEY_ERROR 402 shape.
      return NextResponse.json(
        {
          error: 'No API key configured',
          message: NO_KEY_ERROR,
          code: 'NO_API_KEY',
        },
        { status: 402 }
      )
    }
    if (result.error === 'invalid_description') {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }
    // generation_failed — surface as 500 with the model's reason.
    log.api(
      'POST /api/modules/forge generation failed',
      { reason: result.message },
      'error'
    )
    return NextResponse.json({ error: result.message }, { status: 500 })
  }

  // Success. The draft is RETURNED only. The caller must explicitly POST
  // the manifest to /api/modules to activate it. See the inline comment at
  // the top of this file and lib/modules/forge.ts.
  return NextResponse.json({ draft: result.draft }, { status: 200 })
}
