import { useEffect, useState } from 'react'

export const useBrainConnection = (
  isAuthenticated: boolean,
): boolean | null => {
  const [hasBrain, setHasBrain] = useState<boolean | null>(null)
  useEffect(() => {
    if (!isAuthenticated) {
      setHasBrain(null)
      return
    }
    let cancelled = false
    fetch('/api/connections/codex')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setHasBrain(Boolean(data?.connected))
      })
      .catch(() => {
        if (!cancelled) setHasBrain(null)
      })
    return () => { cancelled = true }
  }, [isAuthenticated])
  return hasBrain
}
