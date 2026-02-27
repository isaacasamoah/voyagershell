// Auth callback route
// Handles magic link redirect from Supabase
// Supports two flows:
//   1. PKCE: ?code=XXX (client-initiated signInWithOtp)
//   2. token_hash: ?token_hash=XXX&type=magiclink (server-generated via admin.generateLink)

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const GET = async (request: NextRequest) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');

  // Validate next param: must be a relative path, no open redirect
  const rawNext = requestUrl.searchParams.get('next') ?? '/auth/complete';
  const next = (rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes('://'))
    ? rawNext
    : '/auth/complete';

  if (code) {
    // Flow 1: PKCE code exchange (existing)
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[Auth Callback] PKCE exchange error:', error);
      return NextResponse.redirect(
        new URL('/?auth_error=expired_link', requestUrl.origin)
      );
    }

    console.log('[Auth Callback] PKCE session established');
  } else if (tokenHash && type === 'magiclink') {
    // Flow 2: token_hash verification (Resend magic link)
    const supabase = await createClient();
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
  }

  // Redirect to the home page (or specified next URL)
  return NextResponse.redirect(new URL(next, requestUrl.origin));
};
