import type { Json, VoyageRole } from './base'
import type { SessionStatus } from './base'

export type KnowledgeSearchRow = {
  event_id: string; content: string; classifications: string[]; entities: string[];
  topics: string[]; participants: string[]; source_created_at: string;
  similarity: number; knowledge_type: string; attention_score: number;
  context_snippet: string; sender_display_name: string;
  sender_user_id: string; event_type: string
}
export type KeywordSearchRow = Omit<KnowledgeSearchRow, 'participants' | 'similarity'> & { rank_score: number }
export type ScopedKnowledgeRow = Omit<KnowledgeSearchRow, 'participants' | 'similarity'> & {
  session_id: string | null; promotion_count: number
}
export type SourceIngressRow = { event_id: string; status: 'created' | 'replayed' }
export type DeploymentGapRecoveryRow = { recovered: number; rejected: number }
export type KnowledgeByIdRow = Omit<KnowledgeSearchRow, 'participants' | 'similarity'>
export type VoyageMessageRow = Pick<KnowledgeSearchRow,
  'event_id' | 'content' | 'source_created_at' | 'sender_display_name' | 'sender_user_id'>
export type SessionAuthorityRow = {
  id: string; user_id: string; title: string | null; status: SessionStatus;
  last_message_at: string | null; message_count: number | null;
  title_generated_at: string | null; extracted_at: string | null;
  voyage_id: string | null; space_id: string | null; created_at: string;
  updated_at: string | null; voyage_slug: string | null
}
export type SessionScopeRow = Pick<SessionAuthorityRow,
  'id' | 'user_id' | 'voyage_id' | 'voyage_slug' | 'space_id' | 'status'>
export type ResumableSessionRow = Pick<SessionAuthorityRow,
  'id' | 'title' | 'status' | 'last_message_at' | 'message_count' | 'created_at' | 'voyage_slug'>

export type PublicFunctions = {
  archive_session: { Args: { p_session_id: string; p_user_id: string }; Returns: boolean }
  authorize_knowledge_scope: { Args: { p_surface: string; p_user_id: string; p_voyage_slug: string | null };
    Returns: string }
  canonical_space_member_id: { Args: { p_space_id: string; p_user_id: string }; Returns: string }
  claim_source_message_ingress: { Args: { p_actor_id: string; p_transport: string;
    p_client_message_id: string; p_space_id: string | null; p_voyage_slug: string | null;
    p_content: string; p_event_type: string; p_source_type: string; p_actor_type: string;
    p_audience_member_ids: string[]; p_recipient_ids: string[];
    p_metadata: Json; p_source_ref: Json }; Returns: SourceIngressRow[] }
  create_room_invite: { Args: { p_session_id: string; p_inviter_user_id: string;
    p_invitee_user_id: string }; Returns: {
      invite_status: string; invite_space_id: string | null
    }[] }
  create_voyage_with_captain: { Args: { p_description: string; p_name: string; p_slug: string;
    p_user_id: string }; Returns: string }
  generate_invite_code: { Args: Record<PropertyKey, never>; Returns: string }
  get_effective_space_member_ids: { Args: { p_space_id: string }; Returns: { user_id: string }[] }
  get_last_active_voyage_slug: { Args: { p_user_id: string }; Returns: string | null }
  get_or_create_active_session: { Args: { p_user_id: string; p_voyage_slug: string | null };
    Returns: SessionAuthorityRow[] }
  get_resumable_sessions: { Args: { p_user_id: string; p_voyage_slug: string | null;
    p_limit?: number }; Returns: ResumableSessionRow[] }
  get_session_scope: { Args: { p_session_id: string; p_user_id: string };
    Returns: SessionScopeRow[] }
  get_knowledge_by_ids: { Args: { p_event_ids: string[]; p_user_id: string;
    p_voyage_slug: string | null }; Returns: KnowledgeByIdRow[] }
  get_user_voyages: { Args: { p_user_id: string }; Returns: { voyage_id: string; slug: string;
    name: string; role: VoyageRole; joined_at: string }[] }
  get_voyage_by_invite_code: { Args: { p_invite_code: string }; Returns: {
    description: string; id: string; name: string; slug: string }[] }
  get_voyage_role: { Args: { p_user_id: string; p_voyage_slug: string }; Returns: VoyageRole }
  get_voyage_messages: { Args: { p_user_id: string; p_voyage_slug: string;
    p_since: string; p_max_count: number }; Returns: VoyageMessageRow[] }
  increment_promotion_count: { Args: { p_event_id: string }; Returns: undefined }
  is_active_space_member: { Args: { p_space_id: string }; Returns: boolean }
  is_active_voyage_member_by_id: { Args: { p_voyage_id: string }; Returns: boolean }
  is_effective_space_member: { Args: { p_space_id: string; p_user_id: string }; Returns: boolean }
  is_voyage_captain: { Args: { p_user_id: string; p_voyage_slug: string }; Returns: boolean }
  is_voyage_captain_by_id: { Args: { p_voyage_id: string }; Returns: boolean }
  join_voyage_by_code: { Args: { p_invite_code: string; p_user_id: string }; Returns: string }
  keyword_search: { Args: { p_query: string; p_user_id: string; p_voyage_slug?: string | null;
    p_knowledge_type?: string | null; p_min_attention?: number; p_match_count?: number;
  }; Returns: KeywordSearchRow[] }
  knowledge_in_scope: { Args: { p_row_user_id: string | null; p_row_voyage_slug: string | null;
    p_row_event_type: string | null; p_row_knowledge_type: string | null;
    p_row_participants: string[] | null; p_user_id: string | null;
    p_voyage_slug: string | null; p_participants: string[] | null }; Returns: boolean }
  promote_private_voyager_reply: { Args: { p_source_event_id: string; p_conversation_id: string;
    p_user_id: string }; Returns: { shared_event_id: string; status: string;
      shared_content: string }[] }
  regenerate_voyage_invite: { Args: { p_user_id: string; p_voyage_id: string }; Returns: string }
  remove_session_room_member: { Args: { p_session_id: string; p_user_id: string;
    p_member_user_id: string }; Returns: boolean }
  resume_session: { Args: { p_session_id: string; p_user_id: string };
    Returns: SessionAuthorityRow[] }
  search_knowledge: { Args: { query_embedding: string; p_user_id: string; p_voyage_slug?: string;
    p_classifications?: string[]; p_match_threshold?: number; p_match_count?: number;
    p_knowledge_type?: string; p_min_attention?: number };
    Returns: KnowledgeSearchRow[] }
  scoped_knowledge_fetch: { Args: { p_user_id: string; p_voyage_slug?: string | null;
    p_scope?: string; p_content_match?: string | null;
    p_case_sensitive?: boolean; p_since?: string | null; p_until?: string | null;
    p_min_attention?: number; p_match_count?: number; p_sender_user_id?: string | null };
    Returns: ScopedKnowledgeRow[] }
  transition_room_invite: { Args: { p_session_id: string; p_user_id: string;
    p_space_id: string | null; p_action: string }; Returns: {
      transition_status: string; transition_space_id: string | null
    }[] }
  set_session_ai_presence: { Args: { p_session_id: string; p_user_id: string;
    p_present: boolean }; Returns: boolean }
  touch_session_activity: { Args: { p_session_id: string; p_user_id: string }; Returns: boolean }
  update_knowledge_embedding: { Args: { p_embedding: string; p_event_id: string }; Returns: boolean }
}
