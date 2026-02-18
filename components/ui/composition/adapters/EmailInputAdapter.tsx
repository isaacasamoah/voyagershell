// EmailInputAdapter - Inline email field for magic link auth
// Fires sendMagicLink client-side immediately on submit (no LLM round trip)
// Active state: email field + submit button
// Resolved state: "Magic link sent to email@..."

'use client'

import { useState, useCallback } from 'react'
import { Card, Stack, Text, Button, Inline } from '@/components/ui/primitives'
import type { ComponentState, ComponentResolution } from '@/lib/ui/components'

interface EmailInputAdapterProps {
  message?: string
  __state?: ComponentState
  __resolution?: ComponentResolution
  onAction?: (action: string, data?: unknown) => void
  sendMagicLink?: (email: string) => Promise<{ success: boolean; error?: string }>
}

export const EmailInputAdapter = ({
  message,
  __state = 'active',
  __resolution,
  onAction,
  sendMagicLink,
}: EmailInputAdapterProps) => {
  const [email, setEmail] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || isSending) return

    setIsSending(true)
    setError(null)

    // Fire magic link client-side immediately (D16)
    if (sendMagicLink) {
      const result = await sendMagicLink(trimmed)
      if (!result.success) {
        setError(result.error ?? 'Failed to send magic link')
        setIsSending(false)
        return
      }
    }

    setSent(true)
    setIsSending(false)

    // Send email as next user message so Voyager knows what happened
    onAction?.('email_submitted', trimmed)
  }, [email, isSending, sendMagicLink, onAction])

  // Resolved state - collapsed summary
  if (__state === 'resolved' && __resolution) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-green-500">✓</span>
        <Text variant="body">
          Magic link sent to <span className="text-indigo-400">{__resolution.label}</span>
        </Text>
      </div>
    )
  }

  // Dismissed state
  if (__state === 'dismissed') {
    return (
      <Text variant="caption" className="opacity-50">
        [Auth dismissed]
      </Text>
    )
  }

  // Sent state (local, before resolution propagates)
  if (sent) {
    return (
      <Card variant="outlined" className="border-green-500/30 bg-green-500/5">
        <Stack gap="xs">
          <Text variant="label" className="text-green-300">Check your email</Text>
          <Text variant="caption">
            Magic link sent to <span className="text-indigo-400">{email}</span>. Click the link to sign in.
          </Text>
        </Stack>
      </Card>
    )
  }

  // Active state - email input
  return (
    <Card variant="outlined" className="border-indigo-500/30 bg-indigo-500/5">
      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          {message && (
            <Text variant="caption" className="text-slate-400">{message}</Text>
          )}
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              className="flex-1 bg-black/30 border border-white/10 rounded-sm px-3 py-1.5 text-sm text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
            />
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={isSending}
              disabled={!email.trim()}
              kbd="Enter"
            >
              Send link
            </Button>
          </div>
          {error && (
            <Text variant="caption" className="text-red-400">{error}</Text>
          )}
        </Stack>
      </form>
    </Card>
  )
}
