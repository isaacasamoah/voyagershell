'use client'

import { useAuth } from '@/lib/auth/context'
import { VoyagerInterface } from '@/components/ui/VoyagerInterface'
import { VoyagerLanding } from '@/components/ui/VoyagerLanding'

// LandingGate — VoyagerInterface never mounts for unauth users.
// No hooks fire, no conversation fetch, no realtime subscription.
export default function HomePage() {
  const { isAuthenticated, isLoading } = useAuth()

  // Auth loading — show nothing (no flash of either UI)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050505]" />
    )
  }

  if (!isAuthenticated) {
    return <VoyagerLanding />
  }

  return <VoyagerInterface />
}
