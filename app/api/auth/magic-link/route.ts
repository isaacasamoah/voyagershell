import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Resend } from 'resend'
import { getAdminClient } from '@/lib/supabase/admin'
import { getBaseUrl } from '@/lib/auth'
import { magicLinkHtml, magicLinkText } from '@/emails/magic-link'

// =============================================================================
// Rate Limiting
// =============================================================================

// Per-email: max 3 requests per 60 seconds
const PER_EMAIL_LIMIT = 3
const PER_EMAIL_WINDOW_MS = 60_000

// Global: max 20 requests per 60 seconds (abuse prevention across all emails)
const GLOBAL_LIMIT = 20
const GLOBAL_WINDOW_MS = 60_000

const emailAttempts = new Map<string, number[]>()
const globalAttempts: number[] = []

const shouldLogMagicLink = (): boolean =>
  process.env.NODE_ENV === 'development' ||
  process.env.VERCEL_ENV === 'development' ||
  process.env.VERCEL_ENV === 'preview'

const isRateLimited = (email: string): boolean => {
  const now = Date.now()

  // Global check
  while (globalAttempts.length > 0 && now - globalAttempts[0] > GLOBAL_WINDOW_MS) {
    globalAttempts.shift()
  }
  if (globalAttempts.length >= GLOBAL_LIMIT) return true

  // Per-email check
  const attempts = emailAttempts.get(email) ?? []
  const recent = attempts.filter((t) => now - t < PER_EMAIL_WINDOW_MS)
  if (recent.length >= PER_EMAIL_LIMIT) return true

  // Record this attempt
  recent.push(now)
  emailAttempts.set(email, recent)
  globalAttempts.push(now)
  return false
}

// =============================================================================
// Route
// =============================================================================

export const POST = async (request: NextRequest) => {
  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const email = body.email?.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { success: false, error: 'Valid email address required' },
      { status: 400 }
    )
  }

  if (isRateLimited(email)) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please try again in a minute.' },
      { status: 429 }
    )
  }

  try {
    // Generate magic link token via Supabase admin API
    const admin = getAdminClient()
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    if (error || !data?.properties?.hashed_token) {
      console.error('[Auth] generateLink error:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to generate magic link' },
        { status: 500 }
      )
    }

    const { hashed_token } = data.properties
    const callbackUrl = `${getBaseUrl()}/auth/callback?token_hash=${encodeURIComponent(hashed_token)}&type=magiclink`

    // Never report delivery when no transport attempted one.
    if (!process.env.RESEND_API_KEY) {
      // Local and preview operators need a recovery channel when email is absent.
      if (shouldLogMagicLink()) {
        console.log('[Auth] Magic link (non-production):', callbackUrl)
      }
      return NextResponse.json(
        { success: false, outcome: 'transport_unavailable' },
        { status: 503 },
      )
    }

    // Production: send via Resend with React Email template
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'Voyager Shell <onboarding@resend.dev>',
      to: email,
      subject: 'Your magic link is ready',
      html: magicLinkHtml(callbackUrl),
      text: magicLinkText(callbackUrl),
    })

    if (sendError) {
      console.error('[Auth] Resend error:', sendError)
      return NextResponse.json(
        { success: false, error: 'Failed to send email' },
        { status: 500 }
      )
    }

    console.log('[Auth] Magic link sent via Resend to', email)
    return NextResponse.json({ success: true, outcome: 'sent' })
  } catch (error) {
    console.error('[Auth] magic-link route error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
