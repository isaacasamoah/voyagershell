export type CodexErrorClass = 'authentication_failed' | 'connection_failed'

const statusFrom = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return undefined
  const candidate = error as { status?: unknown; statusCode?: unknown }
  if (typeof candidate.statusCode === 'number') return candidate.statusCode
  return typeof candidate.status === 'number' ? candidate.status : undefined
}

export const isCodexAuthError = (error: unknown): boolean => {
  let current = error
  for (let depth = 0; depth < 4; depth++) {
    if (statusFrom(current) === 401) return true
    if (!current || typeof current !== 'object' || !('cause' in current)) return false
    current = (current as { cause?: unknown }).cause
  }
  return false
}

export const classifyCodexError = (error: unknown): CodexErrorClass => (
  isCodexAuthError(error) ? 'authentication_failed' : 'connection_failed'
)
