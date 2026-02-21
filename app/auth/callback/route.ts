// Auth callback route
// Handles magic link redirect from Supabase

import { createClient } from '@/lib/supabase/server';
import { ensurePersonalVoyage } from '@/lib/voyage';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const GET = async (request: NextRequest) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/auth/complete';

  if (code) {
    const supabase = await createClient();

    // Exchange the code for a session
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[Auth Callback] Exchange error:', error);
      // Redirect to home with error indicator
      return NextResponse.redirect(
        new URL('/?auth_error=true', requestUrl.origin)
      );
    }

    console.log('[Auth Callback] Session established successfully');

    // Ensure the user has a personal voyage (idempotent — safe for existing users too)
    if (data.user) {
      ensurePersonalVoyage(data.user.id).catch((err) => {
        console.error('[Auth Callback] Failed to ensure personal voyage:', err);
      });
    }
  }

  // Redirect to the home page (or specified next URL)
  return NextResponse.redirect(new URL(next, requestUrl.origin));
};
