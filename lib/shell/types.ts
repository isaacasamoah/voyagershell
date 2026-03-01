// Shell Contract Types
// The seven verbs. Intent detection. Reconciliation.

export type CommandVerb = 'tell' | 'find' | 'remember' | 'switch' | 'show' | 'do' | 'summon'

export interface ActionIntent {
  verb: CommandVerb
  target?: string          // tom, fambam, etc.
  payload?: string         // the rest of the message
  confidence: number       // 1 for exact verb match, lower for inferred
  source: string           // raw user input
}

export type ReconciliationOutcome =
  | 'match'                // LLM called the expected tool
  | 'confabulation_caught' // LLM claimed to act but didn't — fallback executed
  | 'intentional_skip'     // LLM chose not to act (no claim in response)
  | 'fallback_executed'    // No claim check needed — directly executed fallback

export interface ReconciliationResult {
  outcome: ReconciliationOutcome
  intent: ActionIntent
  expectedTools: string[]
  actualTools: string[]
  fallbackAction?: string
  latencyMs: number
}
