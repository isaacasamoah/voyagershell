// Shell Contract: Intent Detection
// Pre-LLM verb detector. Regex on verb stems. Microseconds.
// Pure function, zero dependencies, fully testable.

import type { ActionIntent, CommandVerb } from './types'

// Verb stems → command mapping
// Each key is a bare verb stem that maps to one of the seven commands
const VERB_MAP: Record<string, CommandVerb> = {
  // tell
  tell: 'tell', message: 'tell', ask: 'tell', send: 'tell', notify: 'tell',
  // find
  find: 'find', search: 'find', look: 'find', grep: 'find',
  // remember
  remember: 'remember', save: 'remember', note: 'remember', keep: 'remember',
  // switch
  switch: 'switch', go: 'switch',
  // show
  show: 'show', list: 'show', display: 'show',
  // do
  do: 'do', create: 'do', invite: 'do', update: 'do',
  // summon
  summon: 'summon', research: 'summon', investigate: 'summon',
}

// Subject pronouns — if a word before the verb is a subject, it's declarative not imperative
const SUBJECT_PRONOUNS = new Set([
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'who', 'that', 'which',
])

// Auxiliary verbs — signal non-imperative usage (questions, past tense, hypotheticals)
const AUXILIARIES = new Set([
  'can', 'could', 'would', 'should', 'will', 'shall', 'may', 'might',
  'do', 'does', 'did', 'was', 'were', 'is', 'am', 'are',
  'has', 'have', 'had', 'been', 'being',
])

// Question words — "what did tom say?" is conversation, not command
const QUESTION_WORDS = new Set([
  'what', 'when', 'where', 'why', 'how', 'who', 'whom', 'whose',
])

/**
 * Detect an actionable intent from a user message.
 * Pure regex — no async, no external calls, < 1ms.
 *
 * Returns ActionIntent if a command verb is detected in imperative position,
 * or null if the message is conversation.
 */
export const detectActionIntent = (message: string): ActionIntent | null => {
  const trimmed = message.trim()
  if (!trimmed) return null

  // Check for @mention at start → tell intent
  const atMentionMatch = trimmed.match(/^@(\w+)\s*([\s\S]*)$/)
  if (atMentionMatch) {
    return {
      verb: 'tell',
      target: atMentionMatch[1].toLowerCase(),
      payload: atMentionMatch[2].trim() || undefined,
      confidence: 1,
      source: trimmed,
    }
  }

  // Tokenize first ~10 words for analysis
  const words = trimmed.split(/\s+/).slice(0, 10)
  if (words.length === 0) return null

  const firstWord = words[0].toLowerCase().replace(/[.,!?;:]+$/, '')

  // If first word is a question word, it's conversation
  if (QUESTION_WORDS.has(firstWord)) return null

  // If first word is an auxiliary, it's not imperative
  // "can you tell tom" → auxiliary "can" before verb
  if (AUXILIARIES.has(firstWord)) return null

  // If first word is a subject pronoun, it's declarative
  // "I was telling tom" → subject "I" before verb
  if (SUBJECT_PRONOUNS.has(firstWord)) return null

  // Check if first word matches a verb stem
  const verb = VERB_MAP[firstWord]
  if (!verb) return null

  // We have a bare verb in first position with no preceding auxiliary/subject.
  // This is imperative mood.

  // Extract target and payload based on verb type
  const rest = words.slice(1)
  const restText = trimmed.slice(trimmed.indexOf(words[1] ?? '') || trimmed.length).trim()

  if (verb === 'tell') {
    // "tell tom the deadline moved" → target: tom, payload: the deadline moved
    const target = rest[0]?.toLowerCase().replace(/[.,!?;:]+$/, '')
    const payload = rest.slice(1).length > 0
      ? trimmed.slice(trimmed.indexOf(rest[1] ?? '') || trimmed.length).trim()
      : undefined
    return {
      verb,
      target: target || undefined,
      payload: payload || undefined,
      confidence: 1,
      source: trimmed,
    }
  }

  if (verb === 'switch') {
    // "switch to fambam" → target: fambam (skip "to")
    let target: string | undefined
    if (rest[0]?.toLowerCase() === 'to' && rest[1]) {
      target = rest[1].toLowerCase().replace(/[.,!?;:]+$/, '')
    } else if (rest[0]) {
      target = rest[0].toLowerCase().replace(/[.,!?;:]+$/, '')
    }
    return {
      verb,
      target,
      confidence: 1,
      source: trimmed,
    }
  }

  // For find, remember, show, do, summon — the rest is payload
  return {
    verb,
    payload: restText || undefined,
    confidence: 1,
    source: trimmed,
  }
}
