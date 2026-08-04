export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
export type NullableJson = Json | null
export type NullableUnknown = (unknown & {}) | null

export type Relationship<
  Name extends string = string,
  Column extends string = string,
  ReferencedRelation extends string = string,
  ReferencedColumn extends string = string,
  IsOneToOne extends boolean = false,
> = {
  foreignKeyName: Name
  columns: [Column]
  isOneToOne: IsOneToOne
  referencedRelation: ReferencedRelation
  referencedColumns: [ReferencedColumn]
}

export type TableShape<
  Row,
  Insert,
  Update = Partial<Insert>,
  Relationships extends Relationship<string, string, string, string, boolean>[] = [],
> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: Relationships
}

export type VoyageRole = 'captain' | 'crew'
export type SessionStatus = 'active' | 'historical' | 'archived'
export type MemoryType = 'fact' | 'preference' | 'entity' | 'decision' | 'event' | 'insight' | 'concept'
export type KnowledgeExtractionJobState = 'pending' | 'leased' | 'succeeded' | 'no_claim'
export type KnowledgeRelationJobState = 'pending' | 'leased' | 'completed'
export type KnowledgeDeliveryChannel = 'standing' | 'reach' | 'search'
export type KnowledgeUnitLifecycleActKind = 'cited' | 'retired'
export type KnowledgeExtractionOutcomeKind =
  | 'succeeded'
  | 'no_claim'
  | 'provider_failed'
  | 'malformed_output'
  | 'commit_rejected'
  | 'expired'
