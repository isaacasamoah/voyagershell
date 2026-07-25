// Shell Contract: Reconciler
// Post-LLM verification in onFinish. The guarantee layer.
// Compares detected intent against actual tool calls.
// Catches confabulation, executes additive fallbacks for tell/remember commands.

import type { ActionIntent, CommandVerb, ReconciliationOutcome, ReconciliationResult } from './types'
import { log } from '@/lib/debug'
import { executeFallback, type ReconcileContext } from './reconciliation-fallbacks'

// Verb → expected tool name(s) mapping
const VERB_TOOL_MAP: Record<CommandVerb, string[]> = {
  tell: ['send_message'],
  find: ['semantic_search', 'keyword_grep', 'search_by_time', 'graph', 'get_nodes', 'web_search'],
  remember: ['remember_knowledge'],
  switch: ['switch_voyage'],       // log-only fallback (client-side action)
  show: ['get_messages'],
  do: ['create_voyage', 'invite_to_voyage', 'sign_out', 'set_display_name'],
  summon: ['spawn_background_agent'],
}

// Claim detection — does the response text suggest the action happened?
// Conservative patterns — high confidence only, expand based on logs.
const CLAIM_PATTERNS: Partial<Record<CommandVerb, RegExp>> = {
  tell: /\b(I'll let .+ know|told|messaged|sent .+ (?:a |the )?message|notified|passed .+ along|forwarded|letting .+ know|I've (?:told|messaged|notified|sent))\b/i,
  find: /\b(found|here'?s? what|results|I (?:found|discovered|located)|let me share what)\b/i,
  remember: /\b(remembered|saved|noted|I'll (?:remember|keep|note)|got it|stored|recorded)\b/i,
  switch: /\b(switched to|moved to|now in|changed to|you're now in)\b/i,
  summon: /\b(researching|investigating|looking into|I'll dig into|on it|let me research|I'll look into|I'll investigate)\b/i,
  do: /\b(done|created|invited|updated|I've (?:created|invited|updated)|all set)\b/i,
}

interface ToolCallInfo {
  toolName: string
}

/**
 * Reconcile detected intent against actual tool calls.
 * Called in onFinish after streaming completes.
 *
 * For additive commands (tell, remember): executes fallback if LLM confabulated.
 * For all other commands: forbids a false claim without taking action.
 */
export const reconcileActions = async (
  intent: ActionIntent | null,
  toolCalls: ToolCallInfo[],
  responseText: string,
  ctx: ReconcileContext,
): Promise<ReconciliationResult | null> => {
  const start = performance.now()

  // No intent = conversation mode, nothing to reconcile
  if (!intent) return null

  const expectedTools = VERB_TOOL_MAP[intent.verb] ?? []
  const actualToolNames = toolCalls.map(tc => tc.toolName)
  const calledExpected = actualToolNames.some(name => expectedTools.includes(name))

  // Tool was called → match
  if (calledExpected) {
    const result: ReconciliationResult = {
      outcome: 'match',
      intent,
      expectedTools,
      actualTools: actualToolNames,
      latencyMs: performance.now() - start,
    }
    log.shell(`${intent.verb} | expected: ${expectedTools[0]} | actual: [${actualToolNames.join(', ')}] | match | ${result.latencyMs.toFixed(0)}ms`)
    return result
  }

  // Tool was NOT called — check claim-vs-action
  const claimPattern = CLAIM_PATTERNS[intent.verb]
  const hasClaim = claimPattern ? claimPattern.test(responseText) : false

  // No claim = LLM intentionally chose not to act
  if (!hasClaim) {
    const result: ReconciliationResult = {
      outcome: 'intentional_skip',
      intent,
      expectedTools,
      actualTools: actualToolNames,
      latencyMs: performance.now() - start,
    }
    log.shell(`${intent.verb} | expected: ${expectedTools[0]} | actual: [${actualToolNames.join(', ')}] | intentional_skip | ${result.latencyMs.toFixed(0)}ms`)
    return result
  }

  // Claim without action = confabulation. Execute only additive fallbacks.
  if (intent.verb !== 'tell' && intent.verb !== 'remember') {
    // Forbid-claim gate: no action occurred and no additive fallback is available.
    // The server state did NOT change — the claim is false. No server-side fallback is
    // possible for client-side verbs. Emits 'forbid_claim' (not 'confabulation_caught') to
    // distinguish this path from the fallback-executed path, and logs at warn so false
    // client-verb claims are visible in observability. No log-only-and-return path remains.
    const result: ReconciliationResult = {
      outcome: 'forbid_claim',
      intent,
      expectedTools,
      actualTools: actualToolNames,
      latencyMs: performance.now() - start,
    }
    log.shell(`${intent.verb} | expected: ${expectedTools[0]} | actual: [${actualToolNames.join(', ')}] | FORBID_CLAIM (tool did not fire; client state unchanged) | ${result.latencyMs.toFixed(0)}ms`, undefined, 'warn')
    return result
  }

  // Execute server-side fallback
  const fallbackAction = await executeFallback(intent, ctx)

  const result: ReconciliationResult = {
    outcome: fallbackAction ? 'confabulation_caught' : 'intentional_skip',
    intent,
    expectedTools,
    actualTools: actualToolNames,
    fallbackAction: fallbackAction ?? undefined,
    latencyMs: performance.now() - start,
  }
  log.shell(`${intent.verb} | expected: ${expectedTools[0]} | actual: [${actualToolNames.join(', ')}] | ${result.outcome} | fallback: ${fallbackAction ?? 'none'} | ${result.latencyMs.toFixed(0)}ms`)
  return result
}
