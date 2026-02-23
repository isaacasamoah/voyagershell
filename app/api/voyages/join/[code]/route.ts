// Join voyage API
// POST - Join a voyage using an invite code

import { NextResponse } from 'next/server';
import { requireAuthResponse } from '@/lib/auth';
import {
  getVoyageByInviteCode,
  joinVoyageByCode,
  getUserRole,
} from '@/lib/voyage';

interface RouteParams {
  params: Promise<{ code: string }>;
}

/**
 * GET /api/voyages/join/[code]
 * Preview a voyage before joining (for invite landing page).
 */
export const GET = async (_req: Request, { params }: RouteParams) => {
  const { code } = await params;
  console.log('[Voyage Join API] GET - Previewing invite:', code);

  try {
    // Don't require auth for preview (user may not be logged in yet)
    const voyage = await getVoyageByInviteCode(code);

    if (!voyage) {
      return NextResponse.json(
        { error: 'Invalid or expired invite code' },
        { status: 404 }
      );
    }

    // Return minimal info for preview
    return NextResponse.json({
      voyage: {
        slug: voyage.slug,
        name: voyage.name,
        description: voyage.description,
      },
    });
  } catch (error) {
    console.error('[Voyage Join API] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};

/**
 * POST /api/voyages/join/[code]
 * Join a voyage using an invite code.
 */
export const POST = async (_req: Request, { params }: RouteParams) => {
  const { code } = await params;
  console.log('[Voyage Join API] POST - Joining with code:', code);

  try {
    // Require authentication
    const authResult = await requireAuthResponse();
    if (authResult instanceof Response) return authResult;
    const userId = authResult;

    // Check if voyage exists
    const voyagePreview = await getVoyageByInviteCode(code);

    if (!voyagePreview) {
      return NextResponse.json(
        { error: 'Invalid or expired invite code' },
        { status: 404 }
      );
    }

    // Check if already a member
    const existingRole = await getUserRole(voyagePreview.slug, userId);

    if (existingRole) {
      return NextResponse.json({
        voyage: {
          id: voyagePreview.id,
          slug: voyagePreview.slug,
          name: voyagePreview.name,
        },
        role: existingRole,
        alreadyMember: true,
      });
    }

    // Join the voyage
    const voyage = await joinVoyageByCode(code, userId);

    if (!voyage) {
      return NextResponse.json(
        { error: 'Failed to join voyage' },
        { status: 500 }
      );
    }

    console.log('[Voyage Join API] User joined voyage:', voyage.slug);

    return NextResponse.json({
      voyage: {
        id: voyage.id,
        slug: voyage.slug,
        name: voyage.name,
        description: voyage.description,
      },
      role: 'crew', // New members join as crew
      alreadyMember: false,
    }, { status: 201 });
  } catch (error) {
    console.error('[Voyage Join API] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
