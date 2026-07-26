import { useCallback, useEffect, useState } from 'react'
import { log } from '@/lib/debug'
import { resolveVoyagerIdentity, type VoyagerIdentity } from '@/lib/messaging/address'
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
  const [ownVoyagerIdentity, setOwnVoyagerIdentity] = useState<VoyagerIdentity>({
    handle: '',
    displayName: null,
  })

  const loadOwnIdentity = useCallback(async (): Promise<{
    humanDisplayName: string | null
    voyagerIdentity: VoyagerIdentity
  }> => {
    const supabase = createClient()
    const [profileResult, handleResult] = await Promise.all([
      supabase.from('profiles').select('display_name, username').maybeSingle(),
      supabase.from('handles').select('handle').eq('kind', 'voyager').maybeSingle(),
    ])
    const profile = profileResult.data as {
      display_name: string | null
      username: string | null
    } | null
    const rowHandle = (handleResult.data as { handle: string } | null)?.handle ?? null
    return {
      humanDisplayName: profileResult.error ? null : (profile?.display_name ?? null),
      // Match the server's fail-closed behavior: a handles read error must not
      // invent a derived address that could reclassify a message.
      voyagerIdentity: handleResult.error
        ? { handle: '', displayName: null }
        : resolveVoyagerIdentity(rowHandle, profile?.username ?? null),
    }
  }, [])

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

  // Fetch human + Voyager identity when authenticated.
  // Stale-closure guard (`cancelled`) prevents a slow fetch from overwriting null
  // after sign-out when two effect firings race.
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) {
      setDisplayName(null)
      setOwnVoyagerIdentity({ handle: '', displayName: null })
      return
    }
    let cancelled = false
    void loadOwnIdentity()
      .then((identity) => {
        if (cancelled) return
        setDisplayName(identity.humanDisplayName)
        setOwnVoyagerIdentity(identity.voyagerIdentity)
      })
      .catch(() => {
        if (cancelled) return
        setDisplayName(null)
        setOwnVoyagerIdentity({ handle: '', displayName: null })
      })
    return () => { cancelled = true }
  }, [isAuthenticated, isAuthLoading, loadOwnIdentity])

  const refetchOwnVoyagerIdentity = useCallback(async (): Promise<void> => {
    if (!isAuthenticated || isAuthLoading) return
    try {
      const identity = await loadOwnIdentity()
      setDisplayName(identity.humanDisplayName)
      setOwnVoyagerIdentity(identity.voyagerIdentity)
    } catch {
      setOwnVoyagerIdentity({ handle: '', displayName: null })
    }
  }, [isAuthenticated, isAuthLoading, loadOwnIdentity])

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
    ownVoyagerHandle: ownVoyagerIdentity.handle,
    ownVoyagerDisplayName: ownVoyagerIdentity.displayName,
    refetchOwnVoyagerIdentity,
    refetchVoyages,
  }
}
