// Learning signals for conversation improvement
// Track corrections and re-explanations to measure clarity and continuity

import { getAdminClient } from '@/lib/supabase/admin'

export type SignalType =
  | 'correction'      // "no, I meant..."
  | 're-explanation'  // "like I said earlier..."
  | 'clarification'   // "to clarify..."
  | 'frustration'     // "I already told you..."
  | 'positive'        // Implicit approval (no friction)

export interface LearningSignal {
  type: SignalType
  conversationId: string
  messageId?: string
  userId?: string
  voyageSlug?: string
  context: string      // What triggered the signal (snippet)
  timestamp: Date
}

// Pattern definitions for signal detection
const CORRECTION_PATTERNS = [
  /\bno,?\s*(I|we|that|it)\s*(meant|was|is|should)\b/i,
  /\bthat'?s not (what|right|correct)\b/i,
  /\bI (said|meant|was saying)\b/i,
  /\bactually,?\s*(I|we|it|that)\b/i,
  /\bnot what I (asked|meant|said)\b/i,
  /\bwrong,?\s*(I|we|that|it)\b/i,
]

const RE_EXPLANATION_PATTERNS = [
  /\blike I (said|mentioned|told you)\b/i,
  /\bas I (said|mentioned|explained)\b/i,
  /\bI already (told|said|explained|mentioned)\b/i,
  /\bremember,?\s*(I|we|that)\b/i,
  /\bI (just|literally) (said|told you)\b/i,
  /\bagain,?\s*(I|we|the)\b/i,
]

const CLARIFICATION_PATTERNS = [
  /\bto clarify\b/i,
  /\bwhat I mean is\b/i,
  /\blet me (explain|rephrase|be clear)\b/i,
  /\bin other words\b/i,
  /\bto be (clear|specific)\b/i,
]

const FRUSTRATION_PATTERNS = [
  /\bI already told you\b/i,
  /\bhow many times\b/i,
  /\bI keep (saying|telling|explaining)\b/i,
  /\bare you (listening|paying attention)\b/i,
  /\byou'?re not (listening|understanding)\b/i,
]

/**
 * Detect learning signals in a user message.
 * Returns the signal type if detected, null otherwise.
 */
export const detectLearningSignal = (message: string): SignalType | null => {
  // Check patterns in order of severity
  for (const pattern of FRUSTRATION_PATTERNS) {
    if (pattern.test(message)) return 'frustration'
  }

  for (const pattern of CORRECTION_PATTERNS) {
    if (pattern.test(message)) return 'correction'
  }

  for (const pattern of RE_EXPLANATION_PATTERNS) {
    if (pattern.test(message)) return 're-explanation'
  }

  for (const pattern of CLARIFICATION_PATTERNS) {
    if (pattern.test(message)) return 'clarification'
  }

  return null
}

/**
 * Record a learning signal for analysis.
 * Fire-and-forget pattern - don't block the conversation.
 */
export const recordSignal = async (signal: LearningSignal): Promise<void> => {
  try {
    const supabase = getAdminClient()

    // Note: learning_signals table created in migration 017
    // Type cast needed until Supabase types are regenerated
    await supabase.from('learning_signals').insert({
      type: signal.type,
      conversation_id: signal.conversationId,
      message_id: signal.messageId,
      user_id: signal.userId,
      voyage_slug: signal.voyageSlug,
      context: signal.context.slice(0, 500), // Limit context size
      created_at: signal.timestamp.toISOString(),
    })

    console.log('[Learning] Signal recorded:', signal.type)
  } catch (error) {
    // Don't fail the conversation for signal tracking
    console.error('[Learning] Failed to record signal:', error)
  }
}

/**
 * Fire-and-forget signal recording.
 * Use this in the chat flow to avoid blocking.
 */
export const emitSignal = (signal: LearningSignal): void => {
  recordSignal(signal).catch((error) => {
    console.error('[Learning] emitSignal error (non-blocking):', error)
  })
}

