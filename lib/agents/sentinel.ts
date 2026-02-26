// Sentinel — Voyager's Nervous System
// Evaluates message signals, classifies surfacing tier and delivery timing.
//
// Design decisions:
//   D25: Runs in separate LLM context. Each invocation is isolated generateText.
//   D29: Cartographer = WHAT, Sentinel = WHEN/HOW. Different concerns, same graph.
//   D35: Manual triggering — called from message creation path, fire-and-forget.
//   D36: Separate write-back: updateSentinelClassification distinct from updateKnowledgeEnrichment.
//   D38: Natural framing — URGENT:/Also: prefixes, not tier labels.
//   D40: MVP model is Haiku via model router (quality: 'fast').

import { generateText } from 'ai'
import { modelRouter } from '@/lib/models/router'
import { getAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/debug/logger'

// =============================================================================
// Types
// =============================================================================

interface SentinelParams {
  eventId: string
  content: string
  senderName: string
  senderUserId: string
  recipientUserId: string
  voyageSlug: string
}

interface SentinelClassification {
  surfacingTier: 'interrupt' | 'weave' | 'suppress'
  deliverAfter: string | null  // ISO timestamp or null for immediate
  reasoning: string
}

// =============================================================================
// Prompt (D38: natural framing, no tier labels)
// =============================================================================

export const SENTINEL_PROMPT = `You are the nervous system for Voyager, an AI co-pilot. Your job is to evaluate a message and decide how urgently it should be surfaced to the recipient.

You will receive:
- A message from one person to another
- The recipient's preferences (if any)
- The current time

Decide:
1. How urgent is this? Think about what would happen if the recipient saw this in 5 minutes vs 5 hours vs never.
   - If they need to see it NOW (time-sensitive, blocking someone, emergency): surface immediately as urgent
   - If it's useful context but not time-critical (FYI, general updates, casual): weave it in naturally when they next chat
   - If it's noise (acknowledgments like "ok", "thanks", "got it", trivial meta-chat): suppress it entirely
2. Should delivery be delayed? If the message references a future time ("tomorrow", "next week"), hold it until closer to that time.

Respond with EXACTLY this JSON format, nothing else:
{"surfacing_tier": "interrupt" | "weave" | "suppress", "deliver_after": "ISO timestamp" | null, "reasoning": "one sentence why"}`

// =============================================================================
// Load recipient preferences
// =============================================================================

const loadRecipientPreferences = async (
  userId: string,
  voyageSlug: string
): Promise<string[]> => {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('knowledge_current')
    .select('content')
    .eq('knowledge_type', 'preference')
    .or(
      `and(user_id.eq.${userId},voyage_slug.is.null),and(voyage_slug.eq.${voyageSlug},or(participants.is.null,participants.cs.{${userId}}))`
    )
    .order('attention_score', { ascending: false })
    .limit(5)

  if (error || !data) return []

  return data.map((row) => row.content as string)
}

// =============================================================================
// Write-back (D36: separate from Cartographer enrichment)
// =============================================================================

export const updateSentinelClassification = async (
  eventId: string,
  params: { surfacingTier: string; deliverAfter: string | null }
): Promise<boolean> => {
  const supabase = getAdminClient()

  const update: Record<string, unknown> = {
    surfacing_tier: params.surfacingTier,
    updated_at: new Date().toISOString(),
  }

  if (params.deliverAfter) {
    update.deliver_after = params.deliverAfter
    update.delivery_status = 'held'  // Held until deliver_after
  }
  // If no deliver_after, delivery_status stays 'pending' (column default)

  const { error } = await supabase
    .from('knowledge_current')
    .update(update)
    .eq('event_id', eventId)

  if (error) {
    log.agent('Sentinel write-back failed', { eventId, error: error.message }, 'error')
    return false
  }

  log.agent('Sentinel classified', {
    eventId,
    tier: params.surfacingTier,
    deliverAfter: params.deliverAfter ?? 'immediate',
  })
  return true
}

// =============================================================================
// Main Entry Point (D25: isolated generateText per invocation)
// =============================================================================

export const runSentinel = async (params: SentinelParams): Promise<SentinelClassification | null> => {
  const { eventId, content, senderName, senderUserId, recipientUserId, voyageSlug } = params
  const startTime = Date.now()

  log.agent('Sentinel triggered', { eventId, senderName, voyageSlug })

  try {
    // Load recipient's top 5 preferences
    const preferences = await loadRecipientPreferences(recipientUserId, voyageSlug)

    const preferencesSection = preferences.length > 0
      ? `\n\nRecipient preferences:\n${preferences.map(p => `- ${p}`).join('\n')}`
      : '\n\nNo recipient preferences on file.'

    const userPrompt = `Current time: ${new Date().toISOString()}

Message from ${senderName}:
"${content}"${preferencesSection}`

    const result = await generateText({
      model: modelRouter.select({ task: 'chat', quality: 'fast' }),
      system: SENTINEL_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxOutputTokens: 256,
    })

    // Parse structured output
    const text = result.text.trim()
    let parsed: { surfacing_tier: string; deliver_after: string | null; reasoning: string }

    try {
      // Extract JSON from response (may have markdown fences)
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found in response')
      parsed = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      log.agent('Sentinel parse failed, defaulting to weave', {
        eventId,
        text: text.slice(0, 200),
        error: String(parseError),
      }, 'warn')
      // Graceful degradation: unclassified = weave
      return null
    }

    // Validate tier
    const validTiers = ['interrupt', 'weave', 'suppress']
    const tier = validTiers.includes(parsed.surfacing_tier)
      ? parsed.surfacing_tier as 'interrupt' | 'weave' | 'suppress'
      : 'weave'

    const classification: SentinelClassification = {
      surfacingTier: tier,
      deliverAfter: parsed.deliver_after ?? null,
      reasoning: parsed.reasoning ?? '',
    }

    // Write back to knowledge_current (D36)
    await updateSentinelClassification(eventId, {
      surfacingTier: classification.surfacingTier,
      deliverAfter: classification.deliverAfter,
    })

    const durationMs = Date.now() - startTime
    log.agent('Sentinel complete', {
      eventId,
      tier: classification.surfacingTier,
      deliverAfter: classification.deliverAfter ?? 'immediate',
      reasoning: classification.reasoning,
      durationMs,
    })

    return classification
  } catch (err) {
    log.agent('Sentinel failed', {
      eventId,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    }, 'error')
    // Fire-and-forget: never throw. Unclassified messages treated as 'weave' by loadAwareness.
    return null
  }
}
