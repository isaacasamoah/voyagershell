// Knowledge system exports
// Slice 2 Phase 1: Event-Sourced Knowledge Foundation
//
// Philosophy: "Curation is subtraction, not extraction"
// - Messages ARE the knowledge (preserved exactly)
// - Classifications are metadata on source events
// - Quiet the noise, pin the signal

// Event creation (source events, attention events, enrichment)
export {
  emitMessageEvent,
  createMessageEvent,
  createExplicitEvent,
} from './events'
export { updateKnowledgeEnrichment } from './event-enrichment'

export type {
  SourceEventType,
  KnowledgeType,
  Classification,
  ActorType,
  SourceType,
} from './event-types'

// Curator (token-budgeted prompt window)
export { curatePromptWindow, DEFAULT_WINDOW_CONFIG } from './curator'
export type { PromptWindowConfig, CuratedWindow } from './curator'

// Search and retrieval
export {
  searchKnowledge,
  getKnowledgeByIds,
} from './search'
export { keywordGrep, personAnchoredSearch } from './scoped-search'
export type {
  KnowledgeNode,
  SearchOptions,
  GrepOptions,
  GrepResult,
} from './search-types'

// Hybrid search (v2)
export { hybridSearch } from './hybrid'
export type { HybridSearchOptions } from './hybrid'
export { keywordSearch, rrfFuse } from './hybrid-primitives'
export type { RankedResult } from './hybrid-primitives'

// Reranking (v2)
export { cohereRerank } from './rerank'
export type { RerankOptions, RerankResult } from './rerank'

// Reformulation (v2)
export { reformulateQuery } from './reformulate'
