import type {
  Json,
  KnowledgeDeliveryChannel,
  KnowledgeExtractionJobState,
  KnowledgeExtractionOutcomeKind,
  KnowledgeUnitLifecycleActKind,
  MemoryType,
  SessionStatus,
  VoyageRole,
} from './schema/base'
import type { PublicFunctions } from './schema/functions'
import type { KnowledgeTables } from './schema/knowledge-tables'
import type { OperationalTables } from './schema/operational-tables'
import type { ProductTables } from './schema/product-tables'

export type { Json } from './schema/base'
export type { SessionStatus, VoyageRole } from './schema/base'

type PublicTables = ProductTables & KnowledgeTables & OperationalTables
type PublicEnums = {
  memory_type: MemoryType
  session_status: SessionStatus
  voyage_role: VoyageRole
  knowledge_extraction_job_state: KnowledgeExtractionJobState
  knowledge_extraction_outcome_kind: KnowledgeExtractionOutcomeKind
  knowledge_delivery_channel: KnowledgeDeliveryChannel
  knowledge_unit_lifecycle_act_kind: KnowledgeUnitLifecycleActKind
}

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.1' }
  public: {
    Tables: PublicTables
    Views: { [_ in never]: never }
    Functions: PublicFunctions
    Enums: PublicEnums
    CompositeTypes: { [_ in never]: never }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>
type DefaultSchema = DatabaseWithoutInternals[
  Extract<keyof DatabaseWithoutInternals, 'public'>
]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (
        DatabaseWithoutInternals[
          DefaultSchemaTableNameOrOptions['schema']
        ]['Tables']
        & DatabaseWithoutInternals[
          DefaultSchemaTableNameOrOptions['schema']
        ]['Views']
      )
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (
      DatabaseWithoutInternals[
        DefaultSchemaTableNameOrOptions['schema']
      ]['Tables']
      & DatabaseWithoutInternals[
        DefaultSchemaTableNameOrOptions['schema']
      ]['Views']
    )[TableName] extends { Row: infer Row }
    ? Row
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (
      DefaultSchema['Tables'] & DefaultSchema['Views']
    )
    ? (
        DefaultSchema['Tables'] & DefaultSchema['Views']
      )[DefaultSchemaTableNameOrOptions] extends { Row: infer Row }
      ? Row
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[
        DefaultSchemaTableNameOrOptions['schema']
      ]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[
      DefaultSchemaTableNameOrOptions['schema']
    ]['Tables'][TableName] extends { Insert: infer Insert }
    ? Insert
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][
        DefaultSchemaTableNameOrOptions
      ] extends { Insert: infer Insert }
      ? Insert
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[
        DefaultSchemaTableNameOrOptions['schema']
      ]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[
      DefaultSchemaTableNameOrOptions['schema']
    ]['Tables'][TableName] extends { Update: infer Update }
    ? Update
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][
        DefaultSchemaTableNameOrOptions
      ] extends { Update: infer Update }
      ? Update
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[
        DefaultSchemaEnumNameOrOptions['schema']
      ]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[
      DefaultSchemaEnumNameOrOptions['schema']
    ]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  DefaultSchemaCompositeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeName extends DefaultSchemaCompositeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[
        DefaultSchemaCompositeNameOrOptions['schema']
      ]['CompositeTypes']
    : never = never,
> = DefaultSchemaCompositeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[
      DefaultSchemaCompositeNameOrOptions['schema']
    ]['CompositeTypes'][CompositeName]
  : DefaultSchemaCompositeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][DefaultSchemaCompositeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      memory_type: ['fact', 'preference', 'entity', 'decision', 'event', 'insight', 'concept'],
      session_status: ['active', 'historical', 'archived'],
      voyage_role: ['captain', 'crew'],
      knowledge_extraction_job_state: ['pending', 'leased', 'succeeded', 'no_claim'],
      knowledge_extraction_outcome_kind: [
        'succeeded',
        'no_claim',
        'provider_failed',
        'malformed_output',
        'commit_rejected',
        'expired',
      ],
      knowledge_delivery_channel: ['standing', 'reach', 'search'],
      knowledge_unit_lifecycle_act_kind: ['cited', 'retired'],
    },
  },
} as const

export type KnowledgeEventType =
  | 'message' | 'document' | 'slack_message' | 'jira_update' | 'explicit'
  | 'summary' | 'connection' | 'superseded'
export type KnowledgeSourceType = 'conversation' | 'slack' | 'jira' | 'document' | 'explicit'
export type KnowledgeClassification = 'fact' | 'preference' | 'decision' | 'procedure' | 'insight' | 'entity'

export type Profile = Tables<'profiles'>
export type Handle = Tables<'handles'>
export type Session = Tables<'sessions'>
export type AgentTask = Tables<'agent_tasks'>
export type KnowledgeEvent = Tables<'knowledge_events'>
export type KnowledgeCurrent = Tables<'knowledge_current'>
export type Voyage = Tables<'voyages'>
export type VoyageMember = Tables<'voyage_members'>
export type LearningSignal = Tables<'learning_signals'>
export type RetrievalEvent = Tables<'retrieval_events'>
export type NewAgentTask = TablesInsert<'agent_tasks'>
export type MessageRole = 'user' | 'assistant' | 'system'
export type KnowledgeSearchResult = PublicFunctions['search_knowledge']['Returns'][number]
