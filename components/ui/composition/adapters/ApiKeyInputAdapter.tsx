// ApiKeyInputAdapter - Inline API key form for BYO key onboarding
// Submits directly to /api/keys (no LLM round trip — key never touches the stream)
// Active state: provider select, purpose radio, key input, submit
// Resolved state: "Saved <provider> <purpose> key (****<hint>)"

'use client'

import { useState, useCallback } from 'react'
import { Card, Stack, Text, Button } from '@/components/ui/primitives'
import type { ComponentState, ComponentResolution } from '@/lib/ui/components'

const PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter', 'custom'] as const
const PURPOSES = ['conversation', 'reasoning'] as const

type Provider = (typeof PROVIDERS)[number]
type Purpose = (typeof PURPOSES)[number]

interface ApiKeyInputAdapterProps {
  provider?: string
  purpose?: string
  voyageSlug?: string
  message?: string
  __state?: ComponentState
  __resolution?: ComponentResolution
  onAction?: (action: string, data?: unknown) => void
  onSendMessage?: (text: string) => void
}

export const ApiKeyInputAdapter = ({
  provider: initialProvider,
  purpose: initialPurpose,
  voyageSlug,
  message,
  __state = 'active',
  __resolution,
  onAction,
  onSendMessage,
}: ApiKeyInputAdapterProps) => {
  const [provider, setProvider] = useState<Provider>(
    (PROVIDERS.includes(initialProvider as Provider) ? initialProvider : 'anthropic') as Provider
  )
  const [purpose, setPurpose] = useState<Purpose>(
    (PURPOSES.includes(initialPurpose as Purpose) ? initialPurpose : 'conversation') as Purpose
  )
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = apiKey.trim()
    if (!trimmed || isSaving) return

    setIsSaving(true)
    setError(null)

    try {
      const body: Record<string, string> = { provider, purpose, apiKey: trimmed }
      if (provider === 'custom' && baseUrl.trim()) {
        body.baseUrl = baseUrl.trim()
      }
      if (voyageSlug) {
        body.voyageSlug = voyageSlug
      }

      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })

      if (res.status === 201) {
        const data = await res.json()
        const hint = data?.keyHint ?? trimmed.slice(-4)
        onAction?.('key_saved', { provider, purpose, hint })
        onSendMessage?.(`Saved ${provider} ${purpose} key (****${hint})`)
      } else {
        const data = await res.json().catch(() => ({}))
        const errMsg = data?.error ?? `Save failed (${res.status})`
        setError(errMsg)
        onSendMessage?.(`Key save failed: ${errMsg}`)
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Network error'
      setError(errMsg)
      onSendMessage?.(`Key save failed: ${errMsg}`)
    } finally {
      setIsSaving(false)
    }
  }, [apiKey, baseUrl, provider, purpose, voyageSlug, isSaving, onAction, onSendMessage])

  // Resolved state — collapsed summary
  if (__state === 'resolved' && __resolution) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-green-500">✓</span>
        <Text variant="body">
          {__resolution.label}
        </Text>
      </div>
    )
  }

  // Dismissed state
  if (__state === 'dismissed') {
    return (
      <Text variant="caption" className="opacity-50">
        [Key input dismissed]
      </Text>
    )
  }

  // Active state — key input form
  return (
    <Card variant="outlined" className="border-indigo-500/30 bg-indigo-500/5">
      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          {message && (
            <Text variant="caption" className="text-slate-400">{message}</Text>
          )}

          {/* Provider select */}
          <div>
            <Text variant="caption" className="text-slate-500 mb-1 block">Provider</Text>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="w-full bg-black/30 border border-white/10 rounded-sm px-3 py-1.5 text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Purpose radio buttons */}
          <div>
            <Text variant="caption" className="text-slate-500 mb-1 block">Purpose</Text>
            <div className="flex gap-4">
              {PURPOSES.map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="purpose"
                    value={p}
                    checked={purpose === p}
                    onChange={() => setPurpose(p)}
                    className="accent-indigo-500"
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>

          {/* Base URL for custom provider */}
          {provider === 'custom' && (
            <div>
              <Text variant="caption" className="text-slate-500 mb-1 block">Base URL</Text>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
                className="w-full bg-black/30 border border-white/10 rounded-sm px-3 py-1.5 text-sm text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
              />
            </div>
          )}

          {/* API key input */}
          <div>
            <Text variant="caption" className="text-slate-500 mb-1 block">API Key</Text>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                autoFocus
                className="flex-1 bg-black/30 border border-white/10 rounded-sm px-3 py-1.5 text-sm text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
              />
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={isSaving}
                disabled={!apiKey.trim()}
                kbd="Enter"
              >
                Save key
              </Button>
            </div>
          </div>

          {error && (
            <Text variant="caption" className="text-red-400">{error}</Text>
          )}
        </Stack>
      </form>
    </Card>
  )
}
