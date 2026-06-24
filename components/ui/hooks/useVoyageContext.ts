import { useCallback, useEffect, useState } from 'react'
import { log } from '@/lib/debug'
import { createClient } from '@/lib/supabase/client'
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
  const [displayName, setDisplayName] = useState<string | null>(null)

  const fetchVoyages = useCallback(async () => {
    try {
      const res = await fetch('/api/voyages')
      if (!res.ok) return

      const data = await res.json()
      setVoyages(data.voyages || [])

      // Check URL for voyage param (only on initial load, not on refresh)
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
  }, [])

  // Fetch voyages when authenticated (for context bar)
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) return
    fetchVoyages()
  }, [isAuthenticated, isAuthLoading, fetchVoyages])

  // Fetch display name from profiles when authenticated
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) {
      setDisplayName(null)
      return
    }
    const supabase = createClient()
    void (async () => {
      try {
        const { data } = await supabase.from('profiles').select('display_name').maybeSingle()
        setDisplayName((data as { display_name: string | null } | null)?.display_name ?? null)
      } catch {
        setDisplayName(null)
      }
    })()
  }, [isAuthenticated, isAuthLoading])

  /**
   * Refetch the voyages list from the server.
   * Call after create_voyage succeeds so the new voyage appears in the picker
   * without requiring a full page reload.
   */
  const refetchVoyages = useCallback(() => {
    fetchVoyages()
  }, [fetchVoyages])

  return {
    currentVoyage,
    setCurrentVoyage,
    voyages,
    displayName,
    refetchVoyages,
  }
}
