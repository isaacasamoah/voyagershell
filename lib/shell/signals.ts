// Shell Contract: Signal Detection
// Pre-LLM retrieval signal detector. Regex-based, < 1ms.
// Runs alongside verb detection. Dispatches retrieval agents for
// temporal, entity, and retrieval-verb signals.

import { log } from '@/lib/debug'

// =============================================================================
// Types
// =============================================================================

export type SignalType = 'temporal' | 'entity' | 'retrieval_verb'

export interface RetrievalSignal {
  type: SignalType
  trigger: string
  confidence: number
  params?: {
    timeRange?: { since: Date; until?: Date }
    entity?: string
    query?: string
  }
}

// =============================================================================
// Temporal Patterns
// =============================================================================

const TEMPORAL_PATTERNS: Array<{ pattern: RegExp; getRange: (match: RegExpMatchArray) => { since: Date; until?: Date } }> = [
  {
    pattern: /\blast\s+week\b/i,
    getRange: () => ({ since: daysAgo(7) }),
  },
  {
    pattern: /\blast\s+month\b/i,
    getRange: () => ({ since: daysAgo(30) }),
  },
  {
    pattern: /\blast\s+year\b/i,
    getRange: () => ({ since: daysAgo(365) }),
  },
  {
    pattern: /\byesterday\b/i,
    getRange: () => ({ since: daysAgo(1), until: daysAgo(0) }),
  },
  {
    pattern: /\btoday\b/i,
    getRange: () => ({ since: startOfDay(new Date()) }),
  },
  {
    pattern: /\b(\d+)\s+days?\s+ago\b/i,
    getRange: (m) => ({ since: daysAgo(parseInt(m[1], 10)) }),
  },
  {
    pattern: /\b(\d+)\s+weeks?\s+ago\b/i,
    getRange: (m) => ({ since: daysAgo(parseInt(m[1], 10) * 7) }),
  },
  {
    pattern: /\bsince\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    getRange: (m) => ({ since: lastDayOfWeek(m[1]) }),
  },
  {
    pattern: /\bin\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    getRange: (m) => {
      const month = MONTH_MAP[m[1].toLowerCase()]
      const now = new Date()
      const year = month > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear()
      return { since: new Date(year, month, 1), until: new Date(year, month + 1, 0) }
    },
  },
]

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
}

const DAY_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
}

const daysAgo = (n: number): Date => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

const startOfDay = (d: Date): Date => {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

const lastDayOfWeek = (dayName: string): Date => {
  const target = DAY_MAP[dayName.toLowerCase()]
  const now = new Date()
  const current = now.getDay()
  const diff = (current - target + 7) % 7 || 7
  return daysAgo(diff)
}

// =============================================================================
// Retrieval Verb Patterns (non-imperative questions)
// =============================================================================

const RETRIEVAL_VERB_PATTERNS: Array<{ pattern: RegExp; extractQuery: (match: RegExpMatchArray) => string }> = [
  { pattern: /\bwhat did we (?:decide|discuss|talk) about\s+(.+)/i, extractQuery: (m) => m[1].replace(/[?.!]+$/, '').trim() },
  { pattern: /\bdo you remember\s+(.+)/i, extractQuery: (m) => m[1].replace(/[?.!]+$/, '').trim() },
  { pattern: /\banything about\s+(.+)/i, extractQuery: (m) => m[1].replace(/[?.!]+$/, '').trim() },
  { pattern: /\bhave we discussed\s+(.+)/i, extractQuery: (m) => m[1].replace(/[?.!]+$/, '').trim() },
  { pattern: /\bwhat (?:do we|did we) know about\s+(.+)/i, extractQuery: (m) => m[1].replace(/[?.!]+$/, '').trim() },
]

// =============================================================================
// Main Detection
// =============================================================================

/**
 * Detect retrieval-worthy signals in a user message.
 * Pure function — regex-based, no async, < 1ms.
 *
 * Returns RetrievalSignal[] — multiple signals per message are valid.
 */
export const detectRetrievalSignals = (message: string): RetrievalSignal[] => {
  const signals: RetrievalSignal[] = []

  // Temporal signals
  for (const { pattern, getRange } of TEMPORAL_PATTERNS) {
    const match = message.match(pattern)
    if (match) {
      signals.push({
        type: 'temporal',
        trigger: match[0],
        confidence: 0.9,
        params: { timeRange: getRange(match) },
      })
    }
  }

  // Retrieval verb signals
  for (const { pattern, extractQuery } of RETRIEVAL_VERB_PATTERNS) {
    const match = message.match(pattern)
    if (match) {
      signals.push({
        type: 'retrieval_verb',
        trigger: match[0],
        confidence: 0.8,
        params: { query: extractQuery(match) },
      })
    }
  }

  return signals
}

// =============================================================================
// Dispatch
// =============================================================================

interface DispatchContext {
  userId: string
  voyageSlug?: string
  conversationId: string
  waitUntil: (p: Promise<unknown>) => void
  messages?: Array<{ role: string; content: string }>
}

/**
 * Dispatch a retrieval agent based on detected signals.
 * Uses the same enqueueAgentTask + runBackgroundRetrieval path
 * as spawn_background_agent — no new execution infrastructure.
 */
export const dispatchRetrievalAgent = async (
  signals: RetrievalSignal[],
  userMessage: string,
  ctx: DispatchContext,
): Promise<void> => {
  const start = performance.now()

  // Build objective from signals
  const parts: string[] = []
  for (const signal of signals) {
    if (signal.type === 'temporal' && signal.params?.timeRange) {
      parts.push(`Time range: since ${signal.params.timeRange.since.toISOString()}${signal.params.timeRange.until ? ` until ${signal.params.timeRange.until.toISOString()}` : ''}`)
    }
    if (signal.type === 'retrieval_verb' && signal.params?.query) {
      parts.push(`Topic: ${signal.params.query}`)
    }
    if (signal.type === 'entity' && signal.params?.entity) {
      parts.push(`Entity: ${signal.params.entity}`)
    }
  }

  const objective = `Retrieve information relevant to: "${userMessage}"\n${parts.join('\n')}`

  try {
    const { enqueueAgentTask } = await import('@/lib/agents/queue')
    const { runBackgroundRetrieval } = await import('@/lib/agents/deep-retrieval')

    const taskId = await enqueueAgentTask({
      task: objective,
      userId: ctx.userId,
      voyageSlug: ctx.voyageSlug,
      conversationId: ctx.conversationId,
      originalQuery: userMessage,
      conversationSnapshot: ctx.messages as object[] | undefined,
    })

    ctx.waitUntil(
      runBackgroundRetrieval({
        taskId,
        objective,
        userId: ctx.userId,
        voyageSlug: ctx.voyageSlug,
        conversationId: ctx.conversationId,
      })
    )

    const ms = (performance.now() - start).toFixed(0)
    const signalSummary = signals.map(s => `${s.type}:"${s.trigger}"`).join(' + ')
    log.shell(`signal | ${signalSummary} | dispatching agent | ${ms}ms`)
  } catch (error) {
    log.shell(`signal dispatch error: ${String(error)}`, undefined, 'error')
  }
}
