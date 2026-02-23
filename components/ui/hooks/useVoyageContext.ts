import { useEffect, useState } from 'react'
import { log } from '@/lib/debug'
import type { VoyageMembership } from '@/lib/types'

interface UseVoyageContextParams {
  isAuthenticated: boolean
  isAuthLoading: boolean
}

export const useVoyageContext = ({
  isAuthenticated,
  isAuthLoading,
}: UseVoyageContextParams) => {
  const [currentVoyage, setCurrentVoyage] = useState<VoyageMembership | null>(null)
  const [voyages, setVoyages] = useState<VoyageMembership[]>([])
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  // Fetch voyages when authenticated (for context bar)
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) return

    const fetchVoyages = async () => {
      try {
        const res = await fetch('/api/voyages')
        if (!res.ok) return

        const data = await res.json()
        setVoyages(data.voyages || [])

        // Check for pending invite from join page
        const pendingInvite = localStorage.getItem('pendingInvite')
        if (pendingInvite) {
          localStorage.removeItem('pendingInvite')
          const joinRes = await fetch(`/api/voyages/join/${pendingInvite}`, { method: 'POST' })
          if (joinRes.ok) {
            const joinData = await joinRes.json()
            const refreshRes = await fetch('/api/voyages')
            if (refreshRes.ok) {
              const refreshData = await refreshRes.json()
              setVoyages(refreshData.voyages || [])
              const joined = refreshData.voyages?.find((v: VoyageMembership) => v.slug === joinData.voyage.slug)
              if (joined) {
                setCurrentVoyage(joined)
                setFeedbackMessage(joinData.alreadyMember
                  ? `You're already a member of ${joinData.voyage.name}!`
                  : `Welcome to ${joinData.voyage.name}!`)
                setTimeout(() => setFeedbackMessage(null), 3000)
              }
            }
          }
        }

        // Check URL for voyage param
        const urlParams = new URLSearchParams(window.location.search)
        const voyageSlug = urlParams.get('voyage')
        if (voyageSlug && data.voyages) {
          const voyage = data.voyages.find((v: VoyageMembership) => v.slug === voyageSlug)
          if (voyage) {
            setCurrentVoyage(voyage)
          }
        }
      } catch (error) {
        log.voyage('Failed to fetch voyages', { error: String(error) }, 'error')
      }
    }

    fetchVoyages()
  }, [isAuthenticated, isAuthLoading])

  return {
    currentVoyage,
    setCurrentVoyage,
    voyages,
    feedbackMessage,
  }
}
