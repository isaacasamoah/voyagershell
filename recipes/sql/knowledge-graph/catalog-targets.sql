WITH targets AS (
  SELECT 'relation' AS object_type, c.relname AS object_name, c.relkind::text AS detail
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN (
    'knowledge_audiences', 'knowledge_units', 'graph_nodes', 'graph_node_grants',
    'graph_edges', 'graph_edge_evidence', 'graph_authority_edges',
    'graph_edges_target_idx', 'graph_authority_edges_endpoint_idx',
    'graph_authority_edges_target_idx',
    'knowledge_extractor_contracts', 'knowledge_extractor_contracts_one_active',
    'knowledge_extraction_jobs', 'knowledge_extraction_jobs_due',
    'knowledge_extraction_attempts', 'knowledge_extraction_attempt_outcomes',
    'knowledge_graph_backfill_rejections', 'knowledge_edges',
    'idx_edges_source', 'idx_edges_target', 'idx_edges_type')
  UNION ALL
  SELECT 'function', p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN (
    'normalize_knowledge_audience_members', 'canonical_graph_node_id', 'canonical_graph_edge_id',
    'canonical_graph_authority_edge_id',
    'canonical_knowledge_audience_id', 'canonical_space_member_id',
    'reject_immutable_knowledge_graph_row', 'guard_knowledge_event_audience',
    'validate_knowledge_audience', 'validate_knowledge_unit',
    'validate_graph_node', 'guard_graph_node_identity', 'validate_graph_node_grant',
    'graph_node_source_audience', 'validate_graph_edge', 'validate_graph_edge_evidence',
    'viewer_has_graph_node_grant', 'graph_authority_edge_is_current',
    'viewer_has_current_graph_node', 'graph_node_label_for_viewer',
    'authorized_graph_neighbors', 'traverse_knowledge_graph',
    'guard_knowledge_event_source', 'retrieve_knowledge_graph_claims',
    'is_effective_space_member',
    'get_effective_space_member_ids', 'guard_membership_authority_transition',
    'guard_space_authority_identity', 'ensure_authority_audience',
    'grant_current_authority_node', 'project_profile_graph_authority',
    'project_voyage_graph_authority', 'project_voyage_member_graph_authority',
    'project_space_graph_authority', 'project_space_member_graph_authority',
    'project_graph_authority_trigger', 'is_active_voyage_member_by_id',
    'authorize_knowledge_scope', 'transition_room_invite',
    'guard_session_authority_columns', 'deactivate_child_space_memberships',
    'validate_knowledge_extraction_job', 'enqueue_human_knowledge_extraction',
    'begin_knowledge_extraction_attempt', 'complete_knowledge_extraction_attempt',
    'graph_traverse')
  UNION ALL
  SELECT 'type', t.typname, t.typtype::text
  FROM pg_catalog.pg_type t
  JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname IN (
    'graph_node_kind', 'graph_edge_kind', 'knowledge_audience_scope_kind',
    'knowledge_audience_purpose', 'knowledge_extraction_job_state',
    'knowledge_extraction_outcome_kind')
  UNION ALL
  SELECT 'trigger', t.tgname, c.relname
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND t.tgname IN (
    'trg_knowledge_audience_validate', 'trg_knowledge_audience_immutable',
    'trg_knowledge_event_audience_immutable', 'trg_knowledge_unit_validate',
    'trg_knowledge_unit_immutable', 'trg_graph_node_validate',
    'trg_graph_node_identity', 'trg_graph_node_grant_validate',
    'trg_graph_node_grant_immutable', 'trg_graph_edge_validate',
    'trg_graph_edge_immutable', 'trg_graph_edge_evidence_validate',
    'trg_graph_edge_evidence_immutable', 'trg_knowledge_event_source_immutable',
    'trg_knowledge_graph_backfill_rejections_immutable',
    'trg_voyage_members_authority_guard', 'trg_space_members_authority_guard',
    'trg_spaces_authority_guard', 'trg_profiles_graph_authority',
    'trg_profiles_graph_authority_delete', 'trg_voyages_graph_authority',
    'trg_voyage_members_graph_authority_insert', 'trg_voyage_members_graph_authority_delete',
    'trg_voyage_members_graph_authority_state', 'trg_spaces_graph_authority',
    'trg_space_members_graph_authority_insert', 'trg_space_members_graph_authority_delete',
    'trg_space_members_graph_authority_state', 'trg_voyage_member_deactivate_children',
    'trg_sessions_authority_guard', 'trg_knowledge_extraction_job_validate',
    'trg_knowledge_extractor_contract_immutable',
    'trg_knowledge_extraction_attempt_immutable',
    'trg_knowledge_extraction_outcome_immutable',
    'trg_enqueue_human_knowledge_extraction')
  UNION ALL
  SELECT 'column', column_name, table_name
  FROM information_schema.columns
  WHERE table_schema = 'public' AND (
    (table_name = 'knowledge_events' AND column_name = 'knowledge_audience_id')
    OR (table_name = 'voyage_members' AND column_name IN ('state','state_changed_at','revision'))
    OR (table_name = 'space_members' AND column_name IN ('id','state_changed_at','revision')))
  UNION ALL
  SELECT 'constraint', con.conname, c.relname
  FROM pg_catalog.pg_constraint con
  JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND con.conname IN (
    'knowledge_events_knowledge_audience_id_fkey', 'space_members_id_key')
)
SELECT object_type, object_name, detail FROM targets
ORDER BY object_type, object_name, detail;
