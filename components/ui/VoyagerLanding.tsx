'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Terminal, Activity } from 'lucide-react'
import { AstronautState } from '@/components/chat'
import { useAuth } from '@/lib/auth/context'

// Email input states
type EmailState = 'active' | 'sending' | 'sent' | 'error'

export const VoyagerLanding = () => {
  const { sendMagicLink } = useAuth()

  // Welcome line — hidden until LLM responds, fallback after timeout
  const [welcomeLine, setWelcomeLine] = useState<string | null>(null)
  const welcomeFetched = useRef(false)

  // Email input
  const [email, setEmail] = useState('')
  const [emailState, setEmailState] = useState<EmailState>('active')
  const [errorText, setErrorText] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus email input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Fire LLM welcome — organic path only
  useEffect(() => {
    if (welcomeFetched.current) return
    welcomeFetched.current = true

    const hour = new Date().getHours()
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

    const controller = new AbortController()
    const fallbackTimer = setTimeout(() => {
      setWelcomeLine((prev) => prev ?? 'prepare for takeoff.')
    }, 2000)

    fetch('/api/chat/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeOfDay }),
      signal: controller.signal,
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.line) {
          clearTimeout(fallbackTimer)
          setWelcomeLine(data.line)
        }
      })
      .catch(() => {
        // Fallback timer will handle it
      })

    return () => {
      clearTimeout(fallbackTimer)
      controller.abort()
    }
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || emailState === 'sending') return

    setEmailState('sending')
    setErrorText(null)

    const result = await sendMagicLink(trimmed)
    if (!result.success) {
      setErrorText(result.error ?? 'Failed to send magic link')
      setEmailState('error')
      return
    }

    setEmailState('sent')
  }, [email, emailState, sendMagicLink])

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-mono text-sm selection:bg-indigo-500/30 overflow-x-hidden relative flex flex-col">

      {/* HEADER */}
      <div className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#050505]/95 backdrop-blur-md px-4 py-3 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-2 text-indigo-400">
          <Terminal size={16} />
          <span className="font-bold tracking-wider">VOYAGER_SHELL</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-green-500/80 font-bold tracking-widest uppercase">
          <Activity size={10} className="animate-pulse" />
          <span>System Online</span>
        </div>
      </div>

      {/* CENTER — astronaut + welcome + email */}
      <div className="flex-1 flex flex-col items-center justify-center pt-[52px] pb-[120px] px-4">
        {/* Astronaut — static, xl, no animations */}
        <div className="mb-6">
          <img
            src="/images/astronaut/idle.png"
            alt="Voyager"
            className="w-64 h-64 object-contain"
          />
        </div>

        {/* Welcome line — fades in when ready */}
        <p className={`text-slate-400 text-sm mb-8 text-center max-w-md transition-opacity duration-700 ${
          welcomeLine ? 'opacity-100' : 'opacity-0'
        }`}>
          {welcomeLine ?? '\u00A0'}
        </p>
      </div>

      {/* INPUT DECK — fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#050505]/95 backdrop-blur border-t border-white/10 p-4 pb-6">
        <div className="max-w-2xl mx-auto">
          {emailState === 'sent' ? (
            /* Sent — single line confirmation */
            <div className="flex items-center gap-2 text-sm">
              <span className="text-green-500">✓</span>
              <span className="text-slate-300">link sent to</span>
              <span className="text-indigo-400">{email}</span>
              <span className="text-slate-500">— check your inbox</span>
            </div>
          ) : (
            /* Active / Sending / Error — terminal email input */
            <form onSubmit={handleSubmit} className="flex items-start gap-3">
              <span className={`font-bold mt-1 ${
                emailState === 'sending' ? 'text-amber-500' : 'text-green-500 animate-pulse'
              }`}>&#10132;</span>
              <input
                ref={inputRef}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (emailState === 'error') setEmailState('active')
                }}
                placeholder="you@example.com"
                className="flex-1 bg-transparent border-none outline-none text-slate-200 placeholder-slate-700 font-mono text-sm"
                disabled={emailState === 'sending'}
              />
              {errorText && (
                <span className="text-red-400 text-xs mt-1">{errorText}</span>
              )}
              {email.trim() && (
                <button
                  type="submit"
                  disabled={emailState === 'sending'}
                  className={`text-xs font-bold transition mt-1 ${
                    emailState === 'sending'
                      ? 'text-amber-400'
                      : 'text-indigo-400 hover:text-indigo-300'
                  }`}
                >
                  {emailState === 'sending' ? 'SENDING...' : 'SEND'}
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
