// Heartbeat — per-turn operational reinforcement block.
//
// Prepended to the DYNAMIC (uncached) prompt section on every chat turn.
// Purpose: give the model fresh time, a terse identity restatement, and
// (eventually) active workflow state — reinforcement the static prefix
// cannot provide because it is cached.
//
// This is a PURE function. No DB calls. The caller passes whatever state
// it already has loaded. Keeps the heartbeat trivially testable and keeps
// composeSystemPrompt's existing parallel-load pattern intact.

// ============================================================================
// TYPES
// ============================================================================

/**
 * Active workflow state. Optional in v1 — there is no workflows table yet,
 * so callers will always pass `null`. The parameter exists so a future
 * workflows feature can wire state in without touching the signature.
 *
 * TODO(workflows): when a workflows table lands, the caller should load
 * the active row for (userId, voyageSlug) and pass a shaped WorkflowState
 * here. composeHeartbeat will render it into the [WORKFLOW] line.
 */
export interface WorkflowState {
  /** Short name of the active workflow, e.g. "spec-review" */
  name: string;
  /** Current phase within the workflow, e.g. "gather → draft → verify" */
  phase?: string;
  /** One-line note about what is blocking or next */
  note?: string;
}

export interface HeartbeatParams {
  userId: string;
  voyageSlug?: string;
  sessionId?: string;
  workflowState?: WorkflowState | null;
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Returns a human-readable time string like "Saturday 15:42 AEST".
 * Uses the server's local timezone via Intl. Falls back to the raw ISO
 * string if Intl misbehaves in any runtime.
 */
const formatHumanTime = (now: Date): string => {
  try {
    const weekday = new Intl.DateTimeFormat('en-AU', { weekday: 'long' }).format(now);
    const hm = new Intl.DateTimeFormat('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
    // Extract tz abbreviation via timeZoneName: 'short'
    const parts = new Intl.DateTimeFormat('en-AU', { timeZoneName: 'short' }).formatToParts(now);
    const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    return tz ? `${weekday} ${hm} ${tz}` : `${weekday} ${hm}`;
  } catch {
    return now.toISOString();
  }
};

// ============================================================================
// MAIN
// ============================================================================

/**
 * Compose the per-turn heartbeat block.
 *
 * Shape (each tag on its own line, no markdown headers):
 *
 *   [TIME] <ISO 8601> | <human readable>
 *   [IDENTITY] <line 1>
 *              <line 2>
 *              <line 3>
 *   [WORKFLOW] <name> — <phase> — <note>   (only when workflowState present)
 *
 * This block MUST be prepended to the dynamic (uncached) prompt section.
 * Do NOT place it in the static prefix — the cache will freeze the clock.
 */
export const composeHeartbeat = (params: HeartbeatParams): string => {
  // params are accepted for future wiring; only workflowState is read today.
  // userId / voyageSlug / sessionId intentionally unused in v1.
  void params.userId;
  void params.voyageSlug;
  void params.sessionId;

  const now = new Date();
  const iso = now.toISOString();
  const human = formatHumanTime(now);

  const lines: string[] = [];

  // [TIME] — single line, ISO first for machine clarity, human second.
  lines.push(`[TIME] ${iso} | ${human}`);

  // [IDENTITY] — 3 terse operational lines. Present tense. Reinforcement,
  // not replacement — the full personality lives in core.ts.
  // Tag on its own line, lines indented for visual grouping.
  lines.push('[IDENTITY]');
  lines.push('You are Voyager — the user\'s intelligence partner for this voyage.');
  lines.push('You learn over time. You decide when to search, what to remember, what to surface.');
  lines.push('One thread at a time. Name the tradeoff. Route work to the right owner.');

  // [WORKFLOW] — only when caller has active workflow state.
  if (params.workflowState) {
    const { name, phase, note } = params.workflowState;
    const parts = [name];
    if (phase) parts.push(phase);
    if (note) parts.push(note);
    lines.push(`[WORKFLOW] ${parts.join(' — ')}`);
  }

  return lines.join('\n');
};
