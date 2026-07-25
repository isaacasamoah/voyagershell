export type DbError = { message: string }
export type QueryResult = { data: unknown; error: DbError | null }
export type TableName = 'sessions' | 'spaces' | 'space_members' | 'voyages'
export type Filter = { column: string; value: unknown; op: 'eq' | 'in' }

export interface SessionRow {
  id: string
  user_id: string | null
  voyage_id: string | null
  space_id: string | null
  updated_at?: string | null
}

export interface SpaceRow {
  id: string
  kind: string
  voyage_id: string | null
  ai_present: boolean
  created_by: string | null
  created_at?: string | null
}

export interface SpaceMemberRow {
  space_id: string
  user_id: string
  state: 'invited' | 'active' | 'left'
}

export interface VoyageRow {
  id: string
  slug: string
}
