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
  // Has the initial voyage resolution finished? Gates the first conversation
  // load so it can't race ahead and stick on personal before resume resolves.
  const [voyageResolved, setVoyageResolved] = useState(false)
  const [voyages, setVoyages] = useState<VoyageMembership[]>([])
  const [displayName, setDisplayName] = useState<string | null>(null)
  // The user's OWN voyager handle — powers the composer badge. RLS scopes the
  // read to the caller's own row; '' when unnamed (the `voyager` alias carries
  // the badge regardless).
  const [ownVoyagerHandle, setOwnVoyagerHandle] = useState<string>('')

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
      } else if (data.lastActiveVoyageSlug) {
        // Resume the voyage you were last active in ("come back where I was").
        // Session-as-context: this drives the chip; the conversation-load path
        // then loads that voyage's session unchanged. Null → personal (default).
        const last = data.voyages?.find((v: VoyageMembership) => v.slug === data.lastActiveVoyageSlug)
        if (last) setCurrentVoyage(last)
      } else if (data.voyages?.length === 1) {
        // Auto-select when user has exactly one voyage
        setCurrentVoyage(data.voyages[0])
      }
    } catch (error) {
      log.voyage('Failed to fetch voyages', { error: String(error) }, 'error')
    } finally {
      setVoyageResolved(true)
    }
  }, [])

  // Fetch voyages when authenticated (for context bar)
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) return
    fetchVoyages()
  }, [isAuthenticated, isAuthLoading, fetchVoyages])

  // Fetch display name from profiles when authenticated.
  // Stale-closure guard (`cancelled`) prevents a slow fetch from overwriting null
  // after sign-out when two effect firings race.
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) {
      setDisplayName(null)
      setOwnVoyagerHandle('')
      return
    }
    let cancelled = false
    const supabase = createClient()
    void (async () => {
      try {
        const { data } = await supabase.from('profiles').select('display_name').maybeSingle()
        if (!cancelled) setDisplayName((data as { display_name: string | null } | null)?.display_name ?? null)
      } catch {
        if (!cancelled) setDisplayName(null)
      }
      try {
        const { data } = await supabase.from('handles').select('handle').eq('kind', 'voyager').maybeSingle()
        if (!cancelled) setOwnVoyagerHandle((data as { handle: string } | null)?.handle ?? '')
      } catch {
        if (!cancelled) setOwnVoyagerHandle('')
      }
    })()
    return () => { cancelled = true }
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
    voyageResolved,
    setCurrentVoyage,
    voyages,
    displayName,
    ownVoyagerHandle,
    refetchVoyages,
  }
}
