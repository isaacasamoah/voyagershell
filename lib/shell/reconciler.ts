// Shell Contract: Reconciler
// Post-LLM verification in onFinish. The guarantee layer.
// Compares detected intent against actual tool calls.
// Catches confabulation, executes additive fallbacks for tell/remember commands.

import type { ActionIntent, CommandVerb, ReconciliationOutcome, ReconciliationResult } from './types'
import { createMessageEvent, createExplicitEvent } from '@/lib/knowledge/events'
import { getVoyageBySlug, getVoyageMembers } from '@/lib/voyage'
import { log } from '@/lib/debug'
import { fanOutDeliveries } from '@/lib/messaging/deliveries'

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

interface ReconcileContext {
  userId: string
  voyageSlug?: string
  conversationId?: string
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

/**
 * Execute deterministic fallback for a missed command.
 * Returns the action name if executed, null if not possible.
 */
const executeFallback = async (
  intent: ActionIntent,
  ctx: ReconcileContext,
): Promise<string | null> => {
  switch (intent.verb) {
    case 'tell':
      return executeTellFallback(intent, ctx)
    case 'remember':
      return executeRememberFallback(intent, ctx)
    default:
      return null
  }
}

/**
 * Tell fallback: resolve target name → create message event.
 * Same lookup send_message uses (getVoyageMembers + name match).
 */
const executeTellFallback = async (
  intent: ActionIntent,
  ctx: ReconcileContext,
): Promise<string | null> => {
  if (!intent.target || !ctx.voyageSlug) {
    log.shell(`tell fallback skipped: ${!intent.target ? 'no target' : 'no voyage context'}`)
    return null
  }

  try {
    const voyage = await getVoyageBySlug(ctx.voyageSlug)
    if (!voyage) {
      log.shell('[SHELL] tell fallback: voyage not found', undefined, 'warn')
      return null
    }

    const members = await getVoyageMembers(voyage.id)
    const targetLower = intent.target.toLowerCase().trim()

    const usernameMatches = members.filter(m => m.username?.toLowerCase() === targetLower)

    // Same resolution logic as send_message: username, display_name, or nickname match
    const match = usernameMatches.length === 1 ? usernameMatches[0] : members.find(m => {
      const dn = m.displayName?.toLowerCase() ?? ''
      const nn = m.nickname?.toLowerCase() ?? ''
      return dn === targetLower
        || dn.startsWith(targetLower + ' ')
        || dn.split(' ').some(part => part === targetLower)
        || (nn && nn === targetLower)
    })

    if (!match) {
      log.shell(`tell fallback: member "${intent.target}" not found in voyage`)
      return null
    }

    // Don't send to self
    if (match.userId === ctx.userId) {
      log.shell('[SHELL] tell fallback: target is sender, skipping')
      return null
    }

    const senderMember = members.find(m => m.userId === ctx.userId)
    const senderDisplayName = senderMember?.displayName ?? senderMember?.email ?? 'Unknown'
    const content = intent.payload ?? intent.source

    const eventId = await createMessageEvent(
      ctx.conversationId ?? 'shell-reconciler',
      'user',
      content,
      {
        userId: ctx.userId,
        voyageSlug: ctx.voyageSlug,
        participants: [ctx.userId, match.userId],
        addressedTo: [match.userId],
        source: 'mention',
        senderDisplayName,
        senderUserId: ctx.userId,
        attentionScore: 0.85,
        contextSnippet: `${senderDisplayName} to ${match.displayName}: ${content.slice(0, 60)}`,
      }
    )

    // Every send path fans out delivery receipts — the ledger is the single
    // delivery truth, and the repair path is a real send path (omega P1).
    // Awaited: this runs inside the route's waitUntil'd reconciliation task,
    // so a dangling void promise here could be dropped at task completion.
    if (eventId) {
      await fanOutDeliveries(eventId, [match.userId])
    }

    log.shell(`tell fallback executed: message to ${match.displayName}`)

    // Note: Sender confirmation is implicit — the LLM's response already contains
    // the claim ("I'll let Tom know") which triggered confabulation detection.
    // The reconciler makes that claim true. The user sees confirmation in the
    // response text itself. Explicit awareness injection deferred — retrieval
    // filters out self-sent events (.neq('sender_user_id', userId)), so a new
    // "system notification" mechanism would be needed.
    return 'createMessageEvent'
  } catch (error) {
    log.shell(`tell fallback error: ${String(error)}`, undefined, 'error')
    return null
  }
}

/**
 * Remember fallback: persist the intent payload as explicit knowledge.
 * Same as what remember_knowledge tool does.
 */
const executeRememberFallback = async (
  intent: ActionIntent,
  ctx: ReconcileContext,
): Promise<string | null> => {
  if (!intent.payload) {
    log.shell('remember fallback skipped: no payload to save')
    return null
  }

  try {
    const eventId = await createExplicitEvent(intent.payload, {
      userId: ctx.userId,
      voyageSlug: ctx.voyageSlug,
      classifications: ['preference'],
      sessionId: ctx.conversationId,
    })

    if (!eventId) {
      log.shell('remember fallback: createExplicitEvent returned null', undefined, 'warn')
      return null
    }

    log.shell(`remember fallback executed: saved "${intent.payload.slice(0, 40)}"`)
    return 'createExplicitEvent'
  } catch (error) {
    log.shell(`remember fallback error: ${String(error)}`, undefined, 'error')
    return null
  }
}
