'use client'

import { useEffect, useState } from 'react'
import { Terminal } from 'lucide-react'

// After magic link callback, this page tries to close itself.
// The original tab auto-transitions via BroadcastChannel.
export default function AuthCompletePage() {
  const [showFallback, setShowFallback] = useState(false)

  useEffect(() => {
    // Try to close — only works if browser opened this as a popup
    window.close()
    // If still here after 500ms, show fallback
    const timer = setTimeout(() => setShowFallback(true), 500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-mono text-sm flex flex-col items-center justify-center gap-6">
      <div className="flex items-center gap-2 text-indigo-400">
        <Terminal size={16} />
        <span className="font-bold tracking-wider">VOYAGER_SHELL</span>
      </div>
      <p className="text-green-500">✓ signed in</p>
      {showFallback && (
        <p className="text-slate-500 text-xs">
          return to your original tab — it&apos;s already updated.
        </p>
      )}
    </div>
  )
}
