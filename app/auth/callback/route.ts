// Auth callback route
// Handles magic link redirect from Supabase

import { createClient } from '@/lib/supabase/server';
import { ensurePersonalVoyage } from '@/lib/voyage';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const GET = async (request: NextRequest) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  // Validate next param: must be a relative path, no open redirect
  const rawNext = requestUrl.searchParams.get('next') ?? '/auth/complete';
  const next = (rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes('://'))
    ? rawNext
    : '/auth/complete';

  if (code) {
    const supabase = await createClient();

    // Exchange the code for a session
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[Auth Callback] Exchange error:', error);
      // Redirect to home with descriptive error
      return NextResponse.redirect(
        new URL('/?auth_error=expired_link', requestUrl.origin)
      );
    }

    console.log('[Auth Callback] Session established successfully');

    // Ensure the user has a personal voyage (awaited — user needs it on first load)
    if (data.user) {
      try {
        await ensurePersonalVoyage(data.user.id);
      } catch (err) {
        console.error('[Auth Callback] Failed to ensure personal voyage:', err);
      }
    }
  }

  // Redirect to the home page (or specified next URL)
  return NextResponse.redirect(new URL(next, requestUrl.origin));
};
