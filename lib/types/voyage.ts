// Voyage membership type — API contract for /api/voyages

export interface VoyageMembership {
  id: string
  slug: string
  name: string
  role: 'captain' | 'crew'
  joinedAt: string
}
