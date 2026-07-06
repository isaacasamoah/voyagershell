'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Terminal } from 'lucide-react'
import { AstronautState } from '@/components/chat'
import { useAuth } from '@/lib/auth/context'

// Email input states
type EmailState = 'active' | 'sending' | 'sent' | 'error'

// Stretch animation frames — idle → anticipation → extension → peak → idle
// Arms-only movement, legs stay planted throughout
const STRETCH_FRAMES = [
  '/images/astronaut/idle.png',
  '/images/astronaut/stretch-frames/frame-1-uncrossing.png',
  '/images/astronaut/stretch-frames/frame-2-stretched.png',
  '/images/astronaut/stretch-frames/frame-3-peak-stretch.png',
]

// Per-frame hold times (ms) — fast into stretch, hold the peak, ease back
const FRAME_TIMINGS = [
  0,     // idle — n/a (starting frame)
  50,    // anticipation — zip through
  80,    // extension — zip through
  1200,  // peak — BIG hold, the satisfying stretch moment
]

// Crossfade durations per transition
const CROSSFADE_TIMINGS = [
  0,    // idle — n/a
  120,  // into anticipation — quick
  120,  // into extension — quick
  200,  // into peak — slightly slower arrival
]
const CROSSFADE_RETURN = 500  // back to idle — slow ease back, like releasing a stretch

// Randomized idle interval — 20 to 40 seconds between stretches
const randomIdleMs = () => 20000 + Math.random() * 20000

export const VoyagerLanding = () => {
  const { sendMagicLink } = useAuth()
  const searchParams = useSearchParams()

  // Auth error from callback (e.g. expired magic link)
  const authError = searchParams.get('auth_error')

  // Astronaut stretch animation — dual-layer crossfade with variable timing
  const [backSrc, setBackSrc] = useState(STRETCH_FRAMES[0])
  const [frontSrc, setFrontSrc] = useState<string | null>(null)
  const [frontOpacity, setFrontOpacity] = useState(0)
  const [crossfadeDuration, setCrossfadeDuration] = useState(350)

  // Email input
  const [email, setEmail] = useState('')
  const [emailState, setEmailState] = useState<EmailState>('active')
  const [errorText, setErrorText] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus email input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Preload stretch frames + run stretch cycle with crossfade
  useEffect(() => {
    // Preload all frames into browser cache
    STRETCH_FRAMES.forEach((src) => {
      const img = new Image()
      img.src = src
    })

    let timer: ReturnType<typeof setTimeout>
    let raf: number

    const crossfadeTo = (nextSrc: string, durationMs: number, onComplete: () => void) => {
      setCrossfadeDuration(durationMs)
      setFrontSrc(nextSrc)
      // Frame delay so browser registers src + duration change before opacity transition
      raf = requestAnimationFrame(() => {
        setFrontOpacity(1)
      })
      // After crossfade completes, promote front to back
      timer = setTimeout(() => {
        setBackSrc(nextSrc)
        setFrontSrc(null)
        setFrontOpacity(0)
        onComplete()
      }, durationMs)
    }

    const runStretchCycle = () => {
      let frameIndex = 0

      const advance = () => {
        const nextFrame = frameIndex + 1

        if (nextFrame < STRETCH_FRAMES.length) {
          crossfadeTo(STRETCH_FRAMES[nextFrame], CROSSFADE_TIMINGS[nextFrame], () => {
            frameIndex = nextFrame
            timer = setTimeout(advance, FRAME_TIMINGS[nextFrame])
          })
        } else {
          // Return to idle, then wait random interval
          crossfadeTo(STRETCH_FRAMES[0], CROSSFADE_RETURN, () => {
            frameIndex = 0
            timer = setTimeout(runStretchCycle, randomIdleMs())
          })
        }
      }

      advance()
    }

    // First stretch after random idle period
    timer = setTimeout(runStretchCycle, randomIdleMs())

    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
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
      <div className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#050505] backdrop-blur-md px-4 py-3 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-2 text-indigo-400">
          <Terminal size={16} />
          <span className="font-bold tracking-wider">VOYAGER_SHELL</span>
        </div>
      </div>

      {/* CENTER — rainbow wordmark + astronaut + subtitle + email */}
      <div className="flex-1 flex flex-col items-center justify-center pt-[52px] pb-[120px] px-4">

        {/* VOYAGER — big 3D retro rainbow wordmark, deep arch over the astronaut.
            Extrusion = stacked dark layers stepping down-right; face = rainbow sweep. */}
        <svg
          viewBox="0 -50 640 300"
          className="w-[460px] sm:w-[600px] -mb-32 relative z-0 pointer-events-none select-none"
          style={{ filter: 'drop-shadow(0 0 14px rgba(155, 122, 245, 0.18))' }}
          aria-label="VOYAGER"
          role="img"
        >
          <defs>
            {/* Classic 70s-stripe rainbow sweep */}
            <linearGradient id="voyager-rainbow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ff5f56" />
              <stop offset="20%" stopColor="#f7a34b" />
              <stop offset="40%" stopColor="#f4e04d" />
              <stop offset="60%" stopColor="#5ec98f" />
              <stop offset="80%" stopColor="#59a5ff" />
              <stop offset="100%" stopColor="#b07af5" />
            </linearGradient>
            {/* Deep arch — r=300 over a 560 chord */}
            <path id="voyager-arc" d="M 40 235 A 300 300 0 0 1 600 235" fill="none" />
          </defs>
          {/* 3D extrusion — deep block shadow stepping down-right */}
          {[9, 8, 7, 6, 5, 4, 3].map((depth) => (
            <g key={depth} transform={`translate(${depth}, ${depth + 2})`}>
              <text
                fill={depth > 6 ? '#12071f' : '#2a1245'}
                fontSize="80"
                fontWeight="900"
                letterSpacing="26"
                fontFamily="var(--font-geist-mono), ui-monospace, monospace"
              >
                <textPath href="#voyager-arc" startOffset="50%" textAnchor="middle">
                  VOYAGER
                </textPath>
              </text>
            </g>
          ))}
          {/* Face — rainbow gradient with a fine light edge */}
          <text
            fill="url(#voyager-rainbow)"
            stroke="#fff7e6"
            strokeWidth="0.75"
            fontSize="80"
            fontWeight="900"
            letterSpacing="26"
            fontFamily="var(--font-geist-mono), ui-monospace, monospace"
          >
            <textPath href="#voyager-arc" startOffset="50%" textAnchor="middle">
              VOYAGER
            </textPath>
          </text>
        </svg>

        {/* Astronaut — dual-layer crossfade, float animation on container */}
        <div className="relative w-64 h-64 animate-float-idle mb-6 -translate-x-4">
          {/* Back layer — always visible */}
          <img
            src={backSrc}
            alt="Voyager"
            className="absolute inset-0 w-full h-full object-contain"
          />
          {/* Front layer — fades in during transitions */}
          {frontSrc && (
            <img
              src={frontSrc}
              alt=""
              className="absolute inset-0 w-full h-full object-contain"
              style={{
                opacity: frontOpacity,
                transition: `opacity ${crossfadeDuration}ms ease-in-out`,
              }}
            />
          )}
        </div>

        {/* Subtitle — quiet retro whisper under the wordmark */}
        <p className="mb-8 text-center text-xs tracking-[0.5em] text-transparent bg-clip-text bg-gradient-to-r from-[#f7a34b] via-[#f4e04d] to-[#59a5ff] opacity-50">
          let&apos;s go together
        </p>
      </div>

      {/* INPUT DECK — fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#050505] backdrop-blur border-t border-white/10 p-4 pb-6">
        <div className="max-w-2xl mx-auto">
          {/* Auth error from callback (expired link, exchange failure) */}
          {authError && emailState !== 'sent' && !email.trim() && (
            <p className="text-amber-400 text-xs mb-2">
              {authError === 'expired_link'
                ? 'Your magic link has expired. Enter your email to get a new one.'
                : 'Authentication failed. Please try again.'}
            </p>
          )}

          {emailState === 'sent' ? (
            /* Sent — single line confirmation */
            <div className="flex items-center gap-2 text-sm">
              <span className="text-green-500">&#10003;</span>
              <span className="text-slate-300">link sent to</span>
              <span className="text-indigo-400">{email}</span>
              <span className="text-slate-500">-- check your inbox</span>
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
