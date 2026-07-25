// Auth callback route
// Handles magic link redirect from Supabase
// Supports two flows:
//   1. PKCE: ?code=XXX (client-initiated signInWithOtp)
//   2. token_hash: ?token_hash=XXX&type=magiclink (server-generated via admin.generateLink)
//
// Invite flow extension:
//   ?voyage=slug → validate invite → join voyage → redirect to /?voyage=slug

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { acceptVoyageInvite } from '@/lib/voyage/invitations';

export const GET = async (request: NextRequest) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  const voyageSlug = requestUrl.searchParams.get('voyage');

  // Validate next param: must be a relative path, no open redirect
  const rawNext = requestUrl.searchParams.get('next') ?? '/auth/complete';
  const next = (rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes('://'))
    ? rawNext
    : '/auth/complete';

  let authSucceeded = false;
  const supabase = await createClient();

  if (code) {
    // Flow 1: PKCE code exchange (existing)
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[Auth Callback] PKCE exchange error:', error);
      return NextResponse.redirect(
        new URL('/?auth_error=expired_link', requestUrl.origin)
      );
    }

    console.log('[Auth Callback] PKCE session established');
    authSucceeded = true;
  } else if (tokenHash && type === 'magiclink') {
    // Flow 2: token_hash verification (Resend magic link)
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (error) {
      console.error('[Auth Callback] Token verification error:', error);
      return NextResponse.redirect(
        new URL('/?auth_error=expired_link', requestUrl.origin)
      );
    }

    console.log('[Auth Callback] Token hash session established');
    authSucceeded = true;
  }

  // Voyage invite join: if voyage param present and auth succeeded
  if (authSucceeded && voyageSlug) {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (user?.email) {
        const result = await acceptVoyageInvite(user.email, user.id, voyageSlug);

        if (result.joined) {
          console.log('[Auth Callback] Joined voyage via invite', { voyageSlug });
          return NextResponse.redirect(new URL(`/?voyage=${voyageSlug}`, requestUrl.origin));
        } else if (result.alreadyMember) {
          console.log('[Auth Callback] Already a member of voyage', { voyageSlug });
          return NextResponse.redirect(new URL(`/?voyage=${voyageSlug}`, requestUrl.origin));
        } else {
          // No valid invite — graceful degradation, redirect to home
          console.log('[Auth Callback] No valid invite for voyage', { voyageSlug });
        }
      }
    } catch (error) {
      // Graceful degradation: auth succeeded, voyage join failed — still redirect to home
      console.error('[Auth Callback] Voyage join error:', error);
    }
  }

  // Default redirect (no voyage param)
  return NextResponse.redirect(new URL(next, requestUrl.origin));
};
