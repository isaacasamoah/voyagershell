// Agent Primitives
// Declarative agent definitions for Voyager
//
// This is the single source of truth for agent configurations.
// Prompts extracted here can be imported by implementation files.

import type { ModelRequirements } from '@/lib/models/router'
import type { VoyagerEvent } from './event-dispatcher'

// =============================================================================
// Types
// =============================================================================

/**
 * Agent type taxonomy:
 * - primary: Owns conversation, talks to user (Voyager)
 * - background: Heavy lifting, reports to primary via realtime (Retrieval)
 * - event: Triggered by system events, no user interaction (Curator)
 * - scheduled: Runs on cron, no user interaction (Quartermaster)
 */
export type AgentType = 'primary' | 'background' | 'event' | 'scheduled'

/**
 * Event trigger for event-driven agents.
 * event union derived from VoyagerEvent['type'] to stay in sync,
 * plus future events not yet in the dispatcher.
 */
export interface EventTrigger {
  event: VoyagerEvent['type'] | 'knowledge.created' | 'knowledge.updated'
  filter?: Record<string, unknown>
}

export interface AgentDefinition {
  id: string
  name: string
  description: string
  type: AgentType
  model: ModelRequirements
  tools: string[]
  systemPrompt: string | ((ctx: AgentContext) => string | Promise<string>)
  maxTokens?: number
  timeout?: number
  // Primary agent properties
  canSpawn?: string[]           // Agent IDs this agent can spawn (primary only)
  // Background agent properties
  reportsTo?: string            // Parent agent ID (background only)
  tokenBudget?: number          // Max tokens for this agent's work
  // Event agent properties
  trigger?: EventTrigger        // What triggers this agent (event only)
  // Scheduled agent properties
  schedule?: string             // Cron expression (scheduled only)
}

export interface AgentContext {
  userId: string
  voyageSlug?: string
  conversationId?: string
  previousMessages?: Array<{ role: string; content: string }>
  additionalContext?: Record<string, unknown>
}

// =============================================================================
// Extracted Prompts
// =============================================================================

// Prompts are now inline in their respective implementation files:
// - Agentic retrieval prompt → lib/agents/deep-retrieval.ts
// - Post-session prompt → primitives registry below
// - Followup uses composeSystemPrompt (same as primary Voyager)

// =============================================================================
// Agent Registry
// =============================================================================

/**
 * All agent definitions in one place.
 * Implementation files import these to ensure consistency.
 *
 * Agent Type Taxonomy:
 * - primary: Owns conversation (Voyager)
 * - background: Heavy lifting, reports to primary (Retrieval)
 * - event: System-triggered (Curator)
 * - scheduled: Cron-triggered (Quartermaster)
 */
export const AGENT_REGISTRY: Record<string, AgentDefinition> = {
  // =========================================================================
  // PRIMARY AGENTS (own the conversation)
  // =========================================================================

  /**
   * Voyager - the primary conversational agent.
   * Has two tools: spawn_background_agent and web_search.
   * Uses pre-fetched context for quick responses.
   */
  voyager: {
    id: 'voyager',
    name: 'Voyager',
    description: 'Primary conversational agent. Owns the relationship with user.',
    type: 'primary',
    model: {
      task: 'chat',
      quality: 'balanced',
      streaming: true,
      toolUse: true,
    },
    tools: ['spawn_background_agent', 'web_search', 'semantic_search', 'keyword_grep'],
    canSpawn: ['retrieval'],
    systemPrompt: 'core', // Uses CORE_PROMPT from lib/prompts/core.ts
  },

  // =========================================================================
  // BACKGROUND AGENTS (heavy lifting, reports to primary)
  // =========================================================================

  /**
   * Retrieval agent - deep search and synthesis.
   * Spawned by Voyager for comprehensive queries.
   * Reports progress and results via realtime.
   */
  retrieval: {
    id: 'retrieval',
    name: 'Retrieval',
    description: 'Deep search agent for comprehensive queries',
    type: 'background',
    model: {
      task: 'chat',
      quality: 'balanced',
      toolUse: true,
    },
    tools: [
      'semantic_search',
      'keyword_grep',
      'get_connected',
      'get_nodes',
      'search_by_time',
      'web_search',
    ],
    reportsTo: 'voyager',
    tokenBudget: 50000,
    systemPrompt: `You are a retrieval agent for Voyager. Find comprehensive, relevant information from the user's knowledge base using your tools strategically. Reason between searches, evaluate results, and iterate until you have enough or see diminishing returns.`,
    timeout: 60000, // 60s for deep work
  },

  // =========================================================================
  // EVENT AGENTS (triggered by system events)
  // =========================================================================

  /**
   * Curator - learns importance from usage.
   * Triggered when knowledge is created.
   * Adjusts importance scores based on citations.
   */
  curator: {
    id: 'curator',
    name: 'Curator',
    description: 'Learns importance from citations and usage patterns',
    type: 'event',
    model: {
      task: 'decision',
      quality: 'fast',
    },
    tools: [],
    trigger: { event: 'knowledge.created' },
    tokenBudget: 5000,
    systemPrompt: `You analyze knowledge events and determine importance.
Look at: citations, recency, user engagement.
Output: importance_score (0-1), decay_rate, tags.`,
  },

  /**
   * Cartographer - maps the territory as you explore it.
   * Fires mid-conversation when unenriched events accumulate (count-based trigger).
   * Stage 1: classify events (type, attention, context snippet).
   * Stage 2: find cross-session connections via retrieval tools.
   */
  cartographer: {
    id: 'cartographer',
    name: 'Cartographer',
    description: 'Charts and enriches knowledge events during conversation, not post-mortem',
    type: 'event',
    model: {
      task: 'chat',
      quality: 'balanced',
    },
    tools: [
      'semantic_search',
      'keyword_grep',
      'get_connected',
      'get_nodes',
      'search_by_time',
    ],
    trigger: { event: 'knowledge.created' },
    tokenBudget: 50000,
    timeout: 60000,
    systemPrompt: `You are the Cartographer for Voyager. You classify and connect knowledge events during conversation.

For each event, determine:
- knowledge_type: "domain" (facts, concepts, decisions), "operational" (tasks, processes, what happened), or "preference" (user likes, dislikes, habits)
- attention_score: 0.0-1.0 continuous. For domain/operational: importance (1.0 = always surface). For preferences: confidence (1.0 = explicit/repeated, 0.5 = implicit hypothesis)
- context_snippet: One line of context to prepend before re-embedding (improves retrieval)

Then use retrieval tools to find connections to existing knowledge across sessions.`,
  },

  // =========================================================================
  // SCHEDULED AGENTS (cron-triggered)
  // =========================================================================

  /**
   * Quartermaster - nightly maintenance.
   * Runs at 3am daily.
   * Compaction, optimization, cleanup.
   */
  quartermaster: {
    id: 'quartermaster',
    name: 'Quartermaster',
    description: 'Nightly maintenance: compaction, optimization, cleanup',
    type: 'scheduled',
    model: {
      task: 'synthesis',
      quality: 'balanced',
    },
    tools: [],
    schedule: '0 3 * * *', // 3am daily
    tokenBudget: 100000,
    systemPrompt: `You perform nightly maintenance on the knowledge graph.
Tasks: identify stale knowledge, suggest compaction, optimize retrieval.`,
  },

}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get an agent definition by ID.
 */
export const getAgent = (id: string): AgentDefinition | undefined => {
  return AGENT_REGISTRY[id]
}

/**
 * Get all agent definitions.
 */
export const getAllAgents = (): AgentDefinition[] => {
  return Object.values(AGENT_REGISTRY)
}

/**
 * Get agents by type.
 */
export const getAgentsByType = (
  type: AgentDefinition['type']
): AgentDefinition[] => {
  return Object.values(AGENT_REGISTRY).filter((a) => a.type === type)
}
