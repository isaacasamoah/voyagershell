import type { NullableJson, Relationship, TableShape } from './base'

export type OperationalTables = {
  agent_tasks: TableShape<{
    id: string; user_id: string; conversation_id: string; voyage_slug: string | null; code: string;
    task: string; original_query: string | null; priority: string; status: string;
    progress: NullableJson; conversation_snapshot: NullableJson; result: NullableJson;
    error: string | null; duration_ms: number | null;
    created_at: string; updated_at: string; started_at: string | null; completed_at: string | null
  }, { id?: string; user_id: string; conversation_id: string; voyage_slug?: string | null; code: string;
    task: string; original_query?: string | null; priority?: string; status?: string;
    progress?: NullableJson; conversation_snapshot?: NullableJson; result?: NullableJson; error?: string | null;
    duration_ms?: number | null; created_at?: string; updated_at?: string; started_at?: string | null;
    completed_at?: string | null }, Partial<{
      id: string; user_id: string; conversation_id: string; voyage_slug: string | null; code: string;
      task: string; original_query: string | null; priority: string; status: string;
      progress: NullableJson; conversation_snapshot: NullableJson; result: NullableJson; error: string | null;
      duration_ms: number | null; created_at: string; updated_at: string; started_at: string | null;
      completed_at: string | null
    }>, [Relationship<'agent_tasks_user_id_fkey', 'user_id', 'profiles', 'id'>]>
  session_index: TableShape<{
    session_id: string; user_id: string; started_at: string | null; event_count: number | null
  }, { session_id: string; user_id: string; started_at?: string | null; event_count?: number | null }>
  brain_connections: TableShape<{
    id: string; user_id: string; kind: string; provider: string; encrypted_payload: string;
    iv: string; auth_tag: string; account_id: string | null; plan_type: string | null;
    token_expires_at: string | null; status: string; last_refresh_at: string | null;
    created_at: string; updated_at: string; shared_voyage_slug: string | null
  }, { id?: string; user_id: string; kind: string; provider: string; encrypted_payload: string;
    iv: string; auth_tag: string; account_id?: string | null; plan_type?: string | null;
    token_expires_at?: string | null; status?: string; last_refresh_at?: string | null;
    created_at?: string; updated_at?: string; shared_voyage_slug?: string | null }, Partial<{
      id: string; user_id: string; kind: string; provider: string; encrypted_payload: string;
      iv: string; auth_tag: string; account_id: string | null; plan_type: string | null;
      token_expires_at: string | null; status: string; last_refresh_at: string | null;
      created_at: string; updated_at: string; shared_voyage_slug: string | null
    }>, [Relationship<'brain_connections_shared_voyage_slug_fkey',
      'shared_voyage_slug', 'voyages', 'slug'>]>
}
