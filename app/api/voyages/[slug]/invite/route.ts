// Voyage invite API
// POST - Regenerate invite code (captain only)

import { NextResponse } from 'next/server';
import { requireAuthResponse } from '@/lib/auth';
import {
  getVoyageBySlug,
  regenerateInviteCode,
  getInviteUrl,
} from '@/lib/voyage';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/voyages/[slug]/invite
 * Regenerate the voyage invite code. Captain only.
 */
export const POST = async (_req: Request, { params }: RouteParams) => {
  const { slug } = await params;
  console.log('[Voyage Invite API] POST - Regenerating invite for:', slug);

  try {
    // Require authentication
    const authResult = await requireAuthResponse();
    if (authResult instanceof Response) return authResult;
    const userId = authResult;

    // Get voyage
    const voyage = await getVoyageBySlug(slug);

    if (!voyage) {
      return NextResponse.json(
        { error: 'Voyage not found' },
        { status: 404 }
      );
    }

    // Regenerate invite code (function checks captain permission)
    const newCode = await regenerateInviteCode(voyage.id, userId);

    if (!newCode) {
      return NextResponse.json(
        { error: 'Only the captain can regenerate invite codes' },
        { status: 403 }
      );
    }

    console.log('[Voyage Invite API] Regenerated invite code for:', slug);

    return NextResponse.json({
      inviteCode: newCode,
      inviteUrl: getInviteUrl(newCode),
    });
  } catch (error) {
    console.error('[Voyage Invite API] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
