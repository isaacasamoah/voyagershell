import type { TableShape } from '@/lib/supabase/schema/base'
import type {
  GraphEdgeKind, GraphNodeKind, KnowledgeAudiencePurpose, KnowledgeAudienceScopeKind,
} from './contract'

export type GraphTables = {
  knowledge_audiences: TableShape<{
    id: string; purpose: KnowledgeAudiencePurpose; scope_kind: KnowledgeAudienceScopeKind;
    scope_authority_id: string; member_profile_ids: string[]; created_at: string
  }, { id: string; purpose: KnowledgeAudiencePurpose; scope_kind: KnowledgeAudienceScopeKind;
    scope_authority_id: string; member_profile_ids: string[]; created_at?: string }>
  knowledge_units: TableShape<{
    id: string; claim: string; source_event_id: string; extractor_version: string;
    claim_key: string; knowledge_audience_id: string
  }, { id: string; claim: string; source_event_id: string; extractor_version: string;
    claim_key: string; knowledge_audience_id: string }>
  graph_nodes: TableShape<{
    id: string; kind: GraphNodeKind; authority_id: string; label: string
  }, { id: string; kind: GraphNodeKind; authority_id: string; label: string }>
  graph_node_grants: TableShape<{
    node_id: string; knowledge_audience_id: string; basis_kind: string; basis_id: string;
    basis_version: number; label_snapshot: string; granted_at: string; basis_event_id: string | null
  }, { node_id: string; knowledge_audience_id: string; basis_kind: string; basis_id: string;
    basis_version: number; label_snapshot: string; granted_at: string; basis_event_id?: string | null }>
  graph_edges: TableShape<{
    id: string; source_node_id: string; target_node_id: string; kind: GraphEdgeKind; created_at: string
  }, { id: string; source_node_id: string; target_node_id: string; kind: GraphEdgeKind; created_at?: string }>
  graph_edge_evidence: TableShape<{
    edge_id: string; evidence_event_id: string; recorded_at: string
  }, { edge_id: string; evidence_event_id: string; recorded_at?: string }>
  graph_authority_edges: TableShape<{
    id: string; source_node_id: string; target_node_id: string; kind: GraphEdgeKind;
    authority_kind: string; authority_row_id: string; authority_revision: number; state: string;
    effective_at: string; knowledge_audience_id: string; projected_at: string
  }, { id: string; source_node_id: string; target_node_id: string; kind: GraphEdgeKind;
    authority_kind: string; authority_row_id: string; authority_revision: number; state: string;
    effective_at: string; knowledge_audience_id: string; projected_at?: string }>
  knowledge_graph_backfill_rejections: TableShape<{
    source_kind: string; source_id: string; reason: string; source_digest: string
  }, { source_kind: string; source_id: string; reason: string; source_digest: string }>
}
