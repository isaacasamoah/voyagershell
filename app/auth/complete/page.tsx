'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Terminal } from 'lucide-react'
import { VoyagerWordmark } from '@/components/ui/VoyagerWordmark'

// After magic link callback, shows confirmation and redirects.
// Broadcasts auth_complete to original tab via BroadcastChannel.
export default function AuthCompletePage() {
  const router = useRouter()
  const [countdown, setCountdown] = useState(2)

  useEffect(() => {
    // Broadcast to other tabs that auth is complete
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const channel = new BroadcastChannel('voyager-auth')
      channel.postMessage({ type: 'auth_complete' })
      channel.close()
    }

    // Auto-redirect to home after 2 seconds
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          router.push('/')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [router])

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-mono text-sm flex flex-col items-center justify-center gap-6">
      <div className="flex items-center gap-2 text-indigo-400">
        <Terminal size={16} />
        <VoyagerWordmark variant="dock" shell />
      </div>
      <p className="text-green-500">&#10003; signed in</p>
      <p className="text-slate-500 text-xs">
        redirecting in {countdown}... or{' '}
        <button
          type="button"
          onClick={() => router.push('/')}
          className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
        >
          return to Voyager
        </button>
      </p>
    </div>
  )
}
