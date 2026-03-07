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
  updateKnowledgeEnrichment,
} from './events'

export type {
  SourceEventType,
  KnowledgeType,
  Classification,
  ActorType,
  SourceType,
} from './events'

// Search and retrieval
export {
  searchKnowledge,
  getKnowledgeByIds,
  getConnectedKnowledge,
  getRecentKnowledge,
  getPinnedKnowledge,
  formatKnowledgeForPrompt,
  keywordGrep,
  loadPreferences,
  loadPendingMessages,
  loadAwareness,
  buildScopeFilter,
} from './search'

export type { KnowledgeNode, SearchOptions, GrepOptions, GrepResult, AwarenessItem } from './search'

// Hybrid search (v2)
export { hybridSearch, keywordSearch, rrfFuse } from './hybrid'
export type { RankedResult, HybridSearchOptions } from './hybrid'

// Reranking (v2)
export { cohereRerank } from './rerank'
export type { RerankOptions, RerankResult } from './rerank'
