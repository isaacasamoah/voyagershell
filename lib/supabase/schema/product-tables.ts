import type { Json, NullableJson, Relationship, SessionStatus, TableShape, VoyageRole } from './base'

type Profile = { id: string; email: string; display_name: string | null; username: string | null;
  personalization: NullableJson; created_at: string | null }
type Voyage = { id: string; slug: string; name: string; description: string | null; created_by: string | null;
  invite_code: string | null; is_public: boolean; settings: Json; created_at: string; updated_at: string }
type VoyageMember = { id: string; voyage_id: string; user_id: string; role: VoyageRole; nickname: string | null;
  notifications_enabled: boolean; settings: Json; joined_at: string; state: string;
  state_changed_at: string; revision: number }
type Space = { id: string; kind: string; voyage_id: string | null; ai_present: boolean;
  created_by: string | null; created_at: string }
type SpaceMember = { id: string; space_id: string; user_id: string; state: string;
  added_at: string; state_changed_at: string; revision: number }
type Session = { id: string; user_id: string | null; voyage_id: string | null; space_id: string | null;
  status: SessionStatus; title: string | null; title_generated_at: string | null; created_at: string | null;
  updated_at: string | null; last_message_at: string | null; message_count: number | null;
  extracted_at: string | null }

export type ProductTables = {
  profiles: TableShape<Profile,
    { id: string; email: string; display_name?: string | null; username?: string | null;
      personalization?: NullableJson; created_at?: string | null }>
  voyages: TableShape<Voyage,
    { id?: string; slug: string; name: string; description?: string | null; created_by?: string | null;
      invite_code?: string | null; is_public?: boolean; settings?: Json; created_at?: string; updated_at?: string },
    Partial<{ id: string; slug: string; name: string; description: string | null; created_by: string | null;
      invite_code: string | null; is_public: boolean; settings: Json; created_at: string; updated_at: string }>,
    [Relationship<'voyages_created_by_fkey', 'created_by', 'profiles', 'id'>]>
  voyage_members: {
    Row: VoyageMember
    Insert: { id?: string; voyage_id: string; user_id: string; role?: VoyageRole; nickname?: string | null;
      notifications_enabled?: boolean; settings?: Json; joined_at?: string; state?: string;
      state_changed_at?: string; revision?: number }
    Update: Partial<{ id: string; voyage_id: string; user_id: string; role: VoyageRole; nickname: string | null;
      notifications_enabled: boolean; settings: Json; joined_at: string; state: string;
      state_changed_at: string; revision: number }>
    Relationships: [{
        foreignKeyName: 'voyage_members_user_id_fkey'; columns: ['user_id']; isOneToOne: false;
        referencedRelation: 'profiles'; referencedColumns: ['id']
      }, {
        foreignKeyName: 'voyage_members_voyage_id_fkey'; columns: ['voyage_id']; isOneToOne: false;
        referencedRelation: 'voyages'; referencedColumns: ['id']
      }]
  }
  spaces: TableShape<Space,
    { id?: string; kind?: string; voyage_id?: string | null; ai_present?: boolean;
      created_by?: string | null; created_at?: string }, Partial<Space>,
    [Relationship<'spaces_created_by_fkey', 'created_by', 'profiles', 'id'>,
      Relationship<'spaces_voyage_id_fkey', 'voyage_id', 'voyages', 'id'>]>
  space_members: TableShape<SpaceMember,
    { id?: never; space_id: string; user_id: string; state?: string;
      added_at?: string; state_changed_at?: string; revision?: number },
    { id?: never; space_id?: string; user_id?: string; state?: string;
      added_at?: string; state_changed_at?: string; revision?: number },
    [Relationship<'space_members_space_id_fkey', 'space_id', 'spaces', 'id'>,
      Relationship<'space_members_user_id_fkey', 'user_id', 'profiles', 'id'>]>
  sessions: TableShape<Session,
    { id?: string; user_id?: string | null; voyage_id?: string | null; space_id?: string | null;
      status?: SessionStatus; title?: string | null; title_generated_at?: string | null;
      created_at?: string | null; updated_at?: string | null; last_message_at?: string | null;
      message_count?: number | null; extracted_at?: string | null }, Partial<Session>,
    [Relationship<'sessions_space_id_fkey', 'space_id', 'spaces', 'id'>,
      Relationship<'sessions_user_id_fkey', 'user_id', 'profiles', 'id'>]>
  handles: TableShape<{ handle: string; kind: string; owner_user_id: string; created_at: string },
    { handle: string; kind: string; owner_user_id: string; created_at?: string }, Partial<{
      handle: string; kind: string; owner_user_id: string; created_at: string
    }>, [Relationship<'handles_owner_user_id_fkey', 'owner_user_id', 'profiles', 'id'>]>
  voyage_invites: TableShape<{ id: string; voyage_id: string; email: string; invited_by: string;
    status: string; created_at: string; accepted_at: string | null }, { id?: string; voyage_id: string;
    email: string; invited_by: string; status?: string; created_at?: string;
    accepted_at?: string | null }, Partial<{ id: string; voyage_id: string; email: string;
      invited_by: string; status: string; created_at: string; accepted_at: string | null }>,
    [Relationship<'voyage_invites_voyage_id_fkey', 'voyage_id', 'voyages', 'id'>]>
}
