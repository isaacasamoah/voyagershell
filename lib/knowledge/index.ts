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
export { searchKnowledge } from './search'
export type {
  KnowledgeNode,
  SearchOptions,
} from './search-types'
