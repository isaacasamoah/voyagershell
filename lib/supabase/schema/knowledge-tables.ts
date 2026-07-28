import type {
  KnowledgeExtractionJobState,
  KnowledgeExtractionOutcomeKind,
  NullableJson,
  NullableUnknown,
  Relationship,
  TableShape,
} from './base'

type EventRow = {
  id: string; sequence_num: number; user_id: string | null; voyage_slug: string | null;
  event_type: string; content: string | null; metadata: NullableJson; source_type: string | null;
  source_ref: NullableJson; actor_id: string | null; actor_type: string; created_at: string;
  participants: string[] | null; knowledge_audience_id: string | null
}
type CurrentRow = {
  event_id: string; user_id: string | null; voyage_slug: string | null; content: string;
  classifications: string[] | null; entities: string[] | null; topics: string[] | null;
  embedding: string | null; source_created_at: string; updated_at: string;
  participants: string[] | null; event_type: string | null; knowledge_type: string | null;
  attention_score: number | null; context_snippet: string | null; sender_display_name: string | null;
  sender_user_id: string | null; addressed_to: string[] | null; session_id: string | null;
  search_vector: NullableUnknown; superseded_by: string | null; base_attention: number | null;
  promotion_count: number | null; surfacing_tier: string | null; deliver_after: string | null;
  delivery_status: string | null
}
export type KnowledgeTables = {
  knowledge_events: TableShape<EventRow, {
    id?: string; sequence_num?: number; user_id?: string | null; voyage_slug?: string | null;
    event_type: string; content?: string | null; metadata?: NullableJson; source_type?: string | null;
    source_ref?: NullableJson; actor_id?: string | null; actor_type?: string; created_at?: string;
    participants?: string[] | null; knowledge_audience_id?: string | null
  }>
  knowledge_current: TableShape<CurrentRow,
    Partial<CurrentRow> & { event_id: string; content: string; source_created_at: string },
    Partial<CurrentRow>,
    [Relationship<'knowledge_current_event_id_fkey', 'event_id', 'knowledge_events', 'id', true>]>
  messages: TableShape<{
    id: string; session_id: string | null; role: string; content: string;
    knowledge_event_id: string | null; created_at: string | null
  }, { id?: string; session_id?: string | null; role: string; content: string;
    knowledge_event_id?: string | null; created_at?: string | null }, Partial<{
      id: string; session_id: string | null; role: string; content: string;
      knowledge_event_id: string | null; created_at: string | null
    }>, [Relationship<'messages_knowledge_event_id_fkey', 'knowledge_event_id', 'knowledge_events', 'id'>,
      Relationship<'messages_session_id_fkey', 'session_id', 'sessions', 'id'>]>
  message_deliveries: TableShape<{
    id: string; event_id: string; recipient_user_id: string; delivered_at: string | null;
    seen_at: string | null; created_at: string
  }, { id?: string; event_id: string; recipient_user_id: string; delivered_at?: string | null;
    seen_at?: string | null; created_at?: string }, Partial<{
      id: string; event_id: string; recipient_user_id: string; delivered_at: string | null;
      seen_at: string | null; created_at: string
    }>, [Relationship<'message_deliveries_event_id_fkey', 'event_id', 'knowledge_events', 'id'>]>
  private_reply_promotions: TableShape<{
    source_event_id: string; sharer_user_id: string; destination_space_id: string;
    shared_event_id: string; created_at: string
  }, { source_event_id: string; sharer_user_id: string; destination_space_id: string;
    shared_event_id: string; created_at?: string }, Partial<{
      source_event_id: string; sharer_user_id: string; destination_space_id: string;
      shared_event_id: string; created_at: string
    }>, [
      Relationship<'private_reply_promotions_destination_space_id_fkey',
        'destination_space_id', 'spaces', 'id'>,
      Relationship<'private_reply_promotions_shared_event_fkey',
        'shared_event_id', 'knowledge_events', 'id', true>,
      Relationship<'private_reply_promotions_sharer_user_id_fkey',
        'sharer_user_id', 'profiles', 'id'>,
      Relationship<'private_reply_promotions_source_event_id_fkey',
        'source_event_id', 'knowledge_events', 'id'>,
    ]>
  knowledge_extractor_contracts: TableShape<{
    extractor_version: string; active: boolean; activated_at: string
  }, { extractor_version: string; active?: boolean; activated_at?: string }>
  knowledge_extraction_jobs: TableShape<{
    source_event_id: string; extractor_version: string; knowledge_audience_id: string;
    state: KnowledgeExtractionJobState; next_attempt_number: number;
    active_attempt_id: string | null; lease_token: string | null;
    lease_expires_at: string | null; created_at: string; updated_at: string
  }, {
    source_event_id: string; extractor_version: string; knowledge_audience_id: string;
    state?: KnowledgeExtractionJobState; next_attempt_number?: number;
    active_attempt_id?: string | null; lease_token?: string | null;
    lease_expires_at?: string | null; created_at?: string; updated_at?: string
  }>
  knowledge_extraction_attempts: TableShape<{
    id: string; source_event_id: string; extractor_version: string;
    attempt_number: number; knowledge_audience_id: string; model_provider: string;
    model_id: string; resolver_label: string | null; lease_token: string; started_at: string
  }, {
    id: string; source_event_id: string; extractor_version: string;
    attempt_number: number; knowledge_audience_id: string; model_provider: string;
    model_id: string; resolver_label?: string | null; lease_token: string; started_at?: string
  }>
  knowledge_extraction_attempt_outcomes: TableShape<{
    attempt_id: string; source_event_id: string; extractor_version: string;
    knowledge_audience_id: string; outcome: KnowledgeExtractionOutcomeKind;
    raw_output: NullableJson; error_class: string | null; input_tokens: number | null;
    output_tokens: number | null; recorded_at: string
  }, {
    attempt_id: string; source_event_id: string; extractor_version: string;
    knowledge_audience_id: string; outcome: KnowledgeExtractionOutcomeKind;
    raw_output?: NullableJson; error_class?: string | null; input_tokens?: number | null;
    output_tokens?: number | null; recorded_at?: string
  }>
  learning_signals: TableShape<{
    id: string; user_id: string | null; voyage_slug: string | null; type: string;
    context: string | null; conversation_id: string | null; message_id: string | null; created_at: string
  }, { id?: string; user_id?: string | null; voyage_slug?: string | null; type: string;
    context?: string | null; conversation_id?: string | null; message_id?: string | null;
    created_at?: string }, Partial<{
      id: string; user_id: string | null; voyage_slug: string | null; type: string;
      context: string | null; conversation_id: string | null; message_id: string | null; created_at: string
    }>, [Relationship<'learning_signals_conversation_id_fkey', 'conversation_id', 'sessions', 'id'>,
      Relationship<'learning_signals_voyage_slug_fkey', 'voyage_slug', 'voyages', 'slug'>]>
  retrieval_events: TableShape<{
    id: string; user_id: string; voyage_slug: string | null; query: string; search_count: number | null;
    pinned_count: number | null; tokens_in_context: number | null; latency_ms: number | null;
    nodes_returned: string[] | null; nodes_cited: string[] | null; citation_confidence: number | null;
    retrieval_threshold: number | null; conversation_id: string | null; created_at: string | null
  }, { id?: string; user_id: string; voyage_slug?: string | null; query: string;
    search_count?: number | null; pinned_count?: number | null; tokens_in_context?: number | null;
    latency_ms?: number | null; nodes_returned?: string[] | null; nodes_cited?: string[] | null;
    citation_confidence?: number | null; retrieval_threshold?: number | null;
    conversation_id?: string | null; created_at?: string | null }>
}
