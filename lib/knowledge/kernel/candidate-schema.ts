import type { Database as InstalledDatabase } from '@/lib/supabase/types'
import type { GraphTables } from './candidate-schema-tables'
import type {
  GraphEdgeKind, GraphNodeKind, KnowledgeAudiencePurpose, KnowledgeAudienceScopeKind,
} from './contract'

type InstalledPublic = InstalledDatabase['public']
type InstalledEvent = InstalledPublic['Tables']['knowledge_events']
type CandidateEvent = {
  Row: InstalledEvent['Row'] & { knowledge_audience_id: string | null }
  Insert: InstalledEvent['Insert'] & { knowledge_audience_id?: string | null }
  Update: InstalledEvent['Update'] & { knowledge_audience_id?: string | null }
  Relationships: InstalledEvent['Relationships']
}
type CandidateTables = Omit<InstalledPublic['Tables'], 'knowledge_events' | 'knowledge_edges'>
  & GraphTables & { knowledge_events: CandidateEvent }
type CandidateFunctions = Omit<InstalledPublic['Functions'], 'graph_traverse'> & {
  retrieve_knowledge_graph_claims_v3: { Args: {
    p_root_authority_id: string; p_viewer_profile_id: string;
    p_exclude_unit_ids?: string[]; p_claim_budget?: number;
    p_per_claim_partner_cap?: number; p_annotation_check_budget?: number;
    p_closure_budget?: number; p_max_depth?: number; p_node_budget?: number;
    p_frontier_budget?: number
  }; Returns: import('@/lib/supabase/types').Json }
  retrieve_knowledge_graph_claims_v2: { Args: {
    p_root_authority_id: string; p_viewer_profile_id: string;
    p_exclude_unit_ids?: string[]; p_max_depth?: number; p_node_budget?: number;
    p_frontier_budget?: number
  }; Returns: import('@/lib/supabase/types').Json }
  retrieve_knowledge_graph_claims: { Args: {
    p_root_kind: GraphNodeKind; p_root_authority_id: string; p_viewer_profile_id: string;
    p_graph_enabled?: boolean; p_max_depth?: number; p_node_budget?: number;
    p_frontier_budget?: number
  }; Returns: { knowledge_unit_id: string; claim: string; source_event_id: string;
    source_content: string }[] }
  traverse_knowledge_graph: { Args: {
    p_root_node_id: string; p_viewer_profile_id: string; p_max_depth?: number;
    p_edge_kinds?: GraphEdgeKind[] | null; p_node_budget?: number; p_frontier_budget?: number
  }; Returns: { node_id: string; kind: GraphNodeKind; authority_id: string;
    label: string; depth: number }[] }
}

export type CandidateDatabase = {
  __InternalSupabase: InstalledDatabase['__InternalSupabase']
  public: {
    Tables: CandidateTables
    Views: InstalledPublic['Views']
    Functions: CandidateFunctions
    Enums: InstalledPublic['Enums'] & {
      graph_edge_kind: GraphEdgeKind
      graph_node_kind: GraphNodeKind
      knowledge_audience_purpose: KnowledgeAudiencePurpose
      knowledge_audience_scope_kind: KnowledgeAudienceScopeKind
    }
    CompositeTypes: InstalledPublic['CompositeTypes']
  }
}

export const CANDIDATE_SCHEMA_FILES = [57, 58, 59, 60, 61, 62, 63] as const
