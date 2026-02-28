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

        // Check URL for voyage param
        const urlParams = new URLSearchParams(window.location.search)
        const voyageSlug = urlParams.get('voyage')
        if (voyageSlug && data.voyages) {
          const voyage = data.voyages.find((v: VoyageMembership) => v.slug === voyageSlug)
          if (voyage) {
            setCurrentVoyage(voyage)
          }
        } else if (data.voyages?.length === 1) {
          // Auto-select when user has exactly one voyage
          setCurrentVoyage(data.voyages[0])
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
