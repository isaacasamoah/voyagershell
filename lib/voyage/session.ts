import { sessionAuthority } from '@/lib/conversation/session-authority'
import { getVoyageBySlug } from './core'

/** Resolve server-authoritative voyage context from a session owned by the caller. */
export const resolveSessionVoyage = async (
  conversationId: string | undefined,
  userId: string,
): Promise<string | null> => {
  if (!conversationId) return null
  return (await sessionAuthority.getScope(conversationId, userId)).voyage_slug
}
export const generateSlug = (name: string): string => name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .substring(0, 50)

export const isSlugAvailable = async (slug: string): Promise<boolean> =>
  (await getVoyageBySlug(slug)) === null
