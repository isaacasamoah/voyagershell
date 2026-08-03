import type {
  Json,
  KnowledgeDeliveryChannel,
  KnowledgeExtractionJobState,
  KnowledgeExtractionOutcomeKind,
  KnowledgeRelationJobState,
  KnowledgeUnitLifecycleActKind,
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
export type KnowledgeTables = {
  knowledge_unit_citations: TableShape<{
    id: string; knowledge_unit_id: string; person_id: string;
    act_kind: KnowledgeUnitLifecycleActKind; session_id: string | null;
    delivery_channel: KnowledgeDeliveryChannel | null; actor_kind: string;
    actor_profile_id: string | null; basis_kind: string; basis_id: string;
    basis_version: number; recorded_at: string
  }, { id?: string; knowledge_unit_id: string; person_id: string;
    act_kind?: KnowledgeUnitLifecycleActKind; session_id?: string | null;
    delivery_channel?: KnowledgeDeliveryChannel | null; actor_kind: string;
    actor_profile_id?: string | null; basis_kind: string; basis_id: string;
    basis_version: number; recorded_at?: string }, Partial<{
      id: string; knowledge_unit_id: string; person_id: string;
      act_kind: KnowledgeUnitLifecycleActKind; session_id: string | null;
      delivery_channel: KnowledgeDeliveryChannel | null; actor_kind: string;
      actor_profile_id: string | null; basis_kind: string; basis_id: string;
      basis_version: number; recorded_at: string
    }>, [
      Relationship<'knowledge_unit_citations_actor_profile_id_fkey',
        'actor_profile_id', 'profiles', 'id'>,
      Relationship<'knowledge_unit_citations_knowledge_unit_id_fkey',
        'knowledge_unit_id', 'knowledge_units', 'id'>,
      Relationship<'knowledge_unit_citations_person_id_fkey',
        'person_id', 'profiles', 'id'>,
    ]>
  knowledge_relation_contracts: TableShape<{
    contract_version: string; description: string; stage1_instruction: string;
    stage2_instruction: string; verdicts: string[]; blocking_spec: Json;
    model_task: string; model_quality: string; provider_calls_per_job: number;
    max_attempts: number; created_at: string
  }, { contract_version: string; description: string; stage1_instruction: string;
    stage2_instruction: string; verdicts: string[]; blocking_spec: Json;
    model_task: string; model_quality: string; provider_calls_per_job: number;
    max_attempts: number; created_at?: string }>
  knowledge_relation_contract_active: TableShape<{
    singleton: boolean; contract_version: string; activated_at: string
  }, { singleton?: boolean; contract_version: string; activated_at?: string }>
  knowledge_relation_backfill_runs: TableShape<{
    contract_version: string; eligible_job_count: number; job_limit: number;
    status: string; recorded_at: string
  }, { contract_version: string; eligible_job_count: number; job_limit: number;
    status: string; recorded_at?: string }>
  knowledge_relation_jobs: TableShape<{
    unit_id: string; person_id: string; contract_version: string;
    state: KnowledgeRelationJobState; next_attempt_number: number;
    active_attempt_id: string | null; lease_token: string | null;
    lease_expires_at: string | null; created_at: string; updated_at: string
  }, { unit_id: string; person_id: string; contract_version: string;
    state?: KnowledgeRelationJobState; next_attempt_number?: number;
    active_attempt_id?: string | null; lease_token?: string | null;
    lease_expires_at?: string | null; created_at?: string; updated_at?: string }>
  knowledge_relation_attempts: TableShape<{
    id: string; unit_id: string; person_id: string; contract_version: string;
    attempt_number: number; candidate_unit_ids: string[]; model_provider: string;
    model_id: string; resolver_label: string | null; lease_token: string; started_at: string
  }, { id: string; unit_id: string; person_id: string; contract_version: string;
    attempt_number: number; candidate_unit_ids: string[]; model_provider: string;
    model_id: string; resolver_label?: string | null; lease_token: string; started_at?: string }>
  knowledge_relation_outcomes: TableShape<{
    attempt_id: string; unit_id: string; person_id: string; contract_version: string;
    submitted_result: KnowledgeExtractionOutcomeKind; submitted_error_class: string | null;
    outcome: KnowledgeExtractionOutcomeKind; raw_output: Json | null;
    relations: Json; grant_requests: Json; error_class: string | null;
    input_tokens: number | null; output_tokens: number | null; recorded_at: string
  }, { attempt_id: string; unit_id: string; person_id: string; contract_version: string;
    submitted_result: KnowledgeExtractionOutcomeKind; submitted_error_class?: string | null;
    outcome: KnowledgeExtractionOutcomeKind; raw_output?: Json | null;
    relations?: Json; grant_requests?: Json; error_class?: string | null;
    input_tokens?: number | null; output_tokens?: number | null; recorded_at?: string }>
  knowledge_relation_assertions: TableShape<{
    edge_id: string; input_unit_ids: string[]; contract_version: string;
    attempt_id: string; recorded_at: string
  }, { edge_id: string; input_unit_ids: string[]; contract_version: string;
    attempt_id: string; recorded_at?: string }>
  knowledge_relation_annotation_index: TableShape<{
    endpoint_unit_id: string; partner_unit_id: string; assertion_person_id: string;
    edge_id: string; assertion_attempt_id: string; edge_kind: string;
    endpoint_is_source: boolean; repair_priority: number; input_unit_ids: string[];
    assertion_recorded_at: string
  }, {
    endpoint_unit_id: string; partner_unit_id: string; assertion_person_id: string;
    edge_id: string; assertion_attempt_id: string; edge_kind: string;
    endpoint_is_source: boolean; repair_priority: number; input_unit_ids: string[];
    assertion_recorded_at: string
  }>
  knowledge_topics: TableShape<{
    id: string; normalized_label: string; embedding: string; created_at: string
  }, { id: string; normalized_label: string; embedding: string; created_at?: string }>
  knowledge_topic_backfill_outcomes: TableShape<{
    unit_id: string; extractor_version: string; raw_output: Json; recorded_at: string
  }, { unit_id: string; extractor_version: string; raw_output: Json; recorded_at?: string }>
  knowledge_events: TableShape<EventRow, {
    id?: string; sequence_num?: number; user_id?: string | null; voyage_slug?: string | null;
    event_type: string; content?: string | null; metadata?: NullableJson; source_type?: string | null;
    source_ref?: NullableJson; actor_id?: string | null; actor_type?: string; created_at?: string;
    participants?: string[] | null; knowledge_audience_id?: string | null
  }>
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
    extractor_version: string; activated_at: string; embedding_model: string | null;
    embedding_dimensions: number | null; topic_similarity_threshold: number | null;
    topic_candidate_limit: number | null; topic_matcher_version: string | null
  }, { extractor_version: string; activated_at?: string; embedding_model?: string | null;
    embedding_dimensions?: number | null; topic_similarity_threshold?: number | null;
    topic_candidate_limit?: number | null; topic_matcher_version?: string | null }>
  knowledge_topic_identity_outcomes: TableShape<{
    unit_id: string; extractor_version: string; raw_output: Json; recorded_at: string
  }, {
    unit_id: string; extractor_version: string; raw_output: Json; recorded_at?: string
  }>
  knowledge_extractor_contract_active: TableShape<{
    singleton: boolean; extractor_version: string; activated_at: string
  }, { singleton?: boolean; extractor_version: string; activated_at?: string }>
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
