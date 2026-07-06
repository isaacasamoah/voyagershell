'use client'

import { Suspense } from 'react'
import { Terminal } from 'lucide-react'
import { useAuth } from '@/lib/auth/context'
import { VoyagerInterface } from '@/components/ui/VoyagerInterface'
import { VoyagerLanding } from '@/components/ui/VoyagerLanding'
import { VoyagerWordmark } from '@/components/ui/VoyagerWordmark'

// LandingGate — VoyagerInterface never mounts for unauth users.
// No hooks fire, no conversation fetch, no realtime subscription.
export default function HomePage() {
  const { isAuthenticated, isLoading } = useAuth()

  // Auth loading — show initializing state (not blank screen)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center gap-4">
        <div className="flex items-center gap-2 text-indigo-400">
          <Terminal size={16} />
          <VoyagerWordmark variant="dock" shell />
        </div>
        <p className="text-slate-600 font-mono text-xs animate-pulse">Initializing...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#050505]" />}>
        <VoyagerLanding />
      </Suspense>
    )
  }

  return <VoyagerInterface />
}
