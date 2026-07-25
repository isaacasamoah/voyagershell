// Retrieval service
// Uses event-sourced knowledge system
//
// Philosophy: "Curation is subtraction, not extraction"
// - Messages ARE the knowledge (preserved exactly)
// - attention_score is the single canonical attention field
// - High attention (>= 0.9) items surface first

import type { KnowledgeNode } from '@/lib/knowledge';

export interface RetrievalResult {
  knowledge: KnowledgeNode[];
  context: string; // Formatted for prompt injection
  tokenEstimate: number;
  // Metadata for logging
  metadata: {
    threshold: number;
    pinnedCount: number;
    searchCount: number;
    latencyMs: number;
  };
}

// Export logging utilities
export {
  logRetrievalEvent,
  logCitations,
  detectCitations,
  type RetrievalEventInput,
} from './logging';

// Export retrieval tools for agentic search
export {
  createRetrievalTools,
  type RetrievalTools,
} from './retrieval-tools';
export {
  createVoyagerTools,
  type VoyagerTools,
} from './voyager-tools';
export type {
  ToolContext,
  ToolRegistration,
} from './tool-types';

// Export strategy composition
export { composeToolStrategy } from './strategy';
