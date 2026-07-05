// Shell Contract: Reconciler
// Post-LLM verification in onFinish. The guarantee layer.
// Compares detected intent against actual tool calls.
// Catches confabulation, executes fallbacks for server-side commands.

import type { ActionIntent, CommandVerb, ReconciliationOutcome, ReconciliationResult } from './types'
import { createMessageEvent, createExplicitEvent } from '@/lib/knowledge/events'
import { searchKnowledge } from '@/lib/knowledge/search'
import { getVoyageBySlug, getVoyageMembers } from '@/lib/voyage'
import { log } from '@/lib/debug'

// Verb → expected tool name(s) mapping
const VERB_TOOL_MAP: Record<CommandVerb, string[]> = {
  tell: ['resolve_mention'],
  find: ['semantic_search', 'keyword_grep', 'search_by_time', 'graph', 'get_nodes', 'web_search'],
  remember: ['remember_knowledge'],
  switch: ['switch_voyage'],       // log-only fallback (client-side action)
  show: ['get_messages'],
  do: ['create_voyage', 'invite_to_voyage', 'sign_out', 'set_display_name'],
  summon: ['spawn_background_agent'],
}

// Verbs where the reconciler can execute a server-side fallback
const FALLBACK_ENABLED = new Set<CommandVerb>(['tell', 'find', 'remember', 'summon'])

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
  waitUntil?: (p: Promise<unknown>) => void
  messages?: Array<{ role: string; content: string }>
}

interface ToolCallInfo {
  toolName: string
}

/**
 * Reconcile detected intent against actual tool calls.
 * Called in onFinish after streaming completes.
 *
 * For server-side commands (tell, find): executes fallback if LLM confabulated.
 * For client-side commands (switch, sign_out): logs miss but does not execute.
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

  // Claim without action = confabulation. Execute fallback if enabled.
  if (!FALLBACK_ENABLED.has(intent.verb)) {
    // Forbid-claim gate: client-side verb (switch/show/do/sign_out) claimed without tool fire.
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
    case 'find':
      return executeFindFallback(intent, ctx)
    case 'remember':
      return executeRememberFallback(intent, ctx)
    case 'summon':
      return executeSummonFallback(intent, ctx)
    default:
      return null
  }
}

/**
 * Tell fallback: resolve target name → create message event.
 * Same lookup resolve_mention uses (getVoyageMembers + name match).
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
    const targetLower = intent.target.toLowerCase()

    // Same resolution logic as resolve_mention: display_name or nickname match
    const match = members.find(m => {
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

    await createMessageEvent(
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

    log.shell(`tell fallback executed: message to ${match.displayName}`)

    // Note: Sender confirmation is implicit — the LLM's response already contains
    // the claim ("I'll let Tom know") which triggered confabulation detection.
    // The reconciler makes that claim true. The user sees confirmation in the
    // response text itself. Explicit awareness injection deferred — loadAwareness
    // filters out self-sent events (.neq('sender_user_id', userId)), so a new
    // "system notification" mechanism would be needed.
    return 'createMessageEvent'
  } catch (error) {
    log.shell(`tell fallback error: ${String(error)}`, undefined, 'error')
    return null
  }
}

/**
 * Find fallback: execute searchKnowledge with the intent payload.
 * Results are logged — surfacing to user requires awareness injection (future).
 */
const executeFindFallback = async (
  intent: ActionIntent,
  ctx: ReconcileContext,
): Promise<string | null> => {
  if (!intent.payload) {
    log.shell('[SHELL] find fallback skipped: no payload to search')
    return null
  }

  try {
    const results = await searchKnowledge(ctx.userId, intent.payload, {
      voyageSlug: ctx.voyageSlug,
      limit: 5,
    })

    log.shell(`find fallback executed: ${results.length} results for "${intent.payload.slice(0, 40)}"`)
    // Results logged for now — awareness injection for next turn is a future enhancement
    return 'searchKnowledge'
  } catch (error) {
    log.shell(`find fallback error: ${String(error)}`, undefined, 'error')
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

/**
 * Summon fallback: enqueue background agent task + run retrieval.
 * Same path as spawn_background_agent tool.
 */
const executeSummonFallback = async (
  intent: ActionIntent,
  ctx: ReconcileContext,
): Promise<string | null> => {
  if (!intent.payload || !ctx.waitUntil || !ctx.conversationId) {
    log.shell('summon fallback skipped: missing payload, waitUntil, or conversationId')
    return null
  }

  try {
    const { enqueueAgentTask } = await import('@/lib/agents/queue')
    const { runBackgroundRetrieval } = await import('@/lib/agents/deep-retrieval')

    const taskId = await enqueueAgentTask({
      task: intent.payload,
      userId: ctx.userId,
      voyageSlug: ctx.voyageSlug,
      conversationId: ctx.conversationId,
      originalQuery: intent.source,
      conversationSnapshot: ctx.messages as object[] | undefined,
    })

    ctx.waitUntil(
      runBackgroundRetrieval({
        taskId,
        objective: intent.payload,
        userId: ctx.userId,
        voyageSlug: ctx.voyageSlug,
        conversationId: ctx.conversationId,
      })
    )

    log.shell(`summon fallback executed: task ${taskId} enqueued for "${intent.payload.slice(0, 40)}"`)
    return 'enqueueAgentTask'
  } catch (error) {
    log.shell(`summon fallback error: ${String(error)}`, undefined, 'error')
    return null
  }
}
