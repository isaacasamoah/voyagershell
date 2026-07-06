'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from 'lucide-react'
import { AstronautState } from '@/components/chat'
import { VoyagerWordmark } from '@/components/ui/VoyagerWordmark'

// Connect your ChatGPT subscription as Voyager's brain — device-code flow.
// The one hard prerequisite (OpenAI-side): Settings → Security →
// "Allow device code login" must be ON, so it's step one, not a footnote.

type Phase = 'intro' | 'starting' | 'code' | 'connected' | 'error'

interface DeviceStart {
  device_auth_id: string
  user_code: string
  interval: number
  verification_url: string
}

export default function ConnectPage() {
  const [phase, setPhase] = useState<Phase>('intro')
  const [start, setStart] = useState<DeviceStart | null>(null)
  const [plan, setPlan] = useState<string | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout>>()

  const begin = useCallback(async () => {
    setPhase('starting')
    setErrorText(null)
    try {
      const res = await fetch('/api/connections/codex/device', { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'start failed')
      const data = (await res.json()) as DeviceStart
      setStart(data)
      setPhase('code')
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'something went sideways')
      setPhase('error')
    }
  }, [])

  // Poll while the code screen is up
  useEffect(() => {
    if (phase !== 'code' || !start) return
    let cancelled = false
    const startedAt = Date.now()

    const poll = async () => {
      if (cancelled) return
      if (Date.now() - startedAt > 15 * 60 * 1000) {
        setErrorText('that code expired (they last 15 minutes) — grab a fresh one')
        setPhase('error')
        return
      }
      try {
        const res = await fetch('/api/connections/codex/device/poll', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ device_auth_id: start.device_auth_id, user_code: start.user_code }),
        })
        const data = await res.json()
        if (cancelled) return
        if (res.ok && data.status === 'connected') {
          setPlan(data.plan_type ?? null)
          setPhase('connected')
          return
        }
        if (!res.ok) throw new Error(data.error ?? 'poll failed')
      } catch (err) {
        if (!cancelled) {
          setErrorText(err instanceof Error ? err.message : 'something went sideways')
          setPhase('error')
          return
        }
      }
      pollTimer.current = setTimeout(poll, Math.max(start.interval, 3) * 1000)
    }

    pollTimer.current = setTimeout(poll, Math.max(start.interval, 3) * 1000)
    return () => {
      cancelled = true
      clearTimeout(pollTimer.current)
    }
  }, [phase, start])

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-mono text-sm flex flex-col">
      <div className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#050505] px-4 py-3 flex items-center gap-2 text-indigo-400">
        <Terminal size={16} />
        <VoyagerWordmark variant="dock" shell />
        <span className="text-slate-600 text-xs ml-2">~/connect</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 pt-[52px] max-w-xl mx-auto text-center gap-6">
        {phase === 'connected' ? (
          <>
            <AstronautState state="celebrating" size="xl" />
            <p className="text-lg text-transparent bg-clip-text bg-gradient-to-r from-[#f7a34b] via-[#5ec98f] to-[#59a5ff] font-bold tracking-widest">
              brain connected
            </p>
            <p className="text-slate-400">
              your {plan ? <span className="text-indigo-300">{plan}</span> : 'ChatGPT'} plan now powers Voyager.
              every conversation runs on your own subscription.
            </p>
            <a href="/" className="text-green-500 hover:text-green-400 transition">
              ➔ let&apos;s go
            </a>
          </>
        ) : phase === 'code' && start ? (
          <>
            <AstronautState state="idle" size="lg" />
            <p className="text-slate-400">enter this code at</p>
            <a
              href={start.verification_url}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4 transition"
            >
              {start.verification_url.replace('https://', '')}
            </a>
            <div className="text-4xl font-bold tracking-[0.3em] text-slate-100 border border-white/15 rounded-sm px-8 py-4 bg-white/5 select-all">
              {start.user_code}
            </div>
            <p className="text-xs text-slate-500 animate-pulse">waiting for you to approve it over there…</p>
          </>
        ) : phase === 'error' ? (
          <>
            <AstronautState state="error" size="lg" />
            <p className="text-[#ff5f56]">{errorText}</p>
            <button
              type="button"
              onClick={begin}
              className="px-4 py-2 rounded-sm border border-white/15 text-slate-300 hover:bg-white/5 transition"
            >
              try again
            </button>
          </>
        ) : (
          <>
            <AstronautState state="idle" size="lg" />
            <h1 className="text-lg text-slate-100 font-bold tracking-widest">connect your brain</h1>
            <p className="text-slate-400 leading-relaxed">
              Voyager runs on <span className="text-slate-200">your own ChatGPT subscription</span> —
              no extra bills, your compute, your account.
            </p>
            <ol className="text-left text-slate-400 space-y-3 leading-relaxed">
              <li>
                <span className="text-indigo-300 font-bold">1.</span> in ChatGPT: {' '}
                <a
                  href="https://chatgpt.com/#settings/Security"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4"
                >
                  Settings → Security
                </a>{' '}
                → turn ON <span className="text-slate-200">&ldquo;Allow device code login&rdquo;</span>.
                <span className="block text-xs text-slate-600 mt-1">
                  it&apos;s off by default — without it, the next step silently fails.
                </span>
              </li>
              <li>
                <span className="text-indigo-300 font-bold">2.</span> we&apos;ll show you a short code —
                enter it on OpenAI&apos;s page, and you&apos;re in.
              </li>
            </ol>
            <button
              type="button"
              onClick={begin}
              disabled={phase === 'starting'}
              className="px-5 py-2.5 rounded-sm border border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition font-bold tracking-wider disabled:opacity-50"
            >
              {phase === 'starting' ? 'contacting openai…' : '➔ get my code'}
            </button>
            <p className="text-[11px] text-slate-600 max-w-md">
              your login tokens are stored encrypted and never shown to this browser or anyone else.
              disconnect anytime.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
