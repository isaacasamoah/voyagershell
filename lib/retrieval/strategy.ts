// Tool Strategy Composition
// Composes static preamble + dynamic per-tool hints into a strategy section
// for the system prompt. Module-ready: new tools register with hints.

import { TOOL_STRATEGY_PREAMBLE } from '@/lib/prompts/core'
import type { ToolRegistration } from './tool-types'

/**
 * Compose tool strategy from static preamble + dynamic tool registrations.
 * Produces a complete strategy section for the system prompt.
 */
export const composeToolStrategy = (registrations: ToolRegistration[]): string => {
  const catalogue = registrations
    .map((r) => `- **${r.name}**: ${r.strategyHint}`)
    .join('\n')

  return `${TOOL_STRATEGY_PREAMBLE}

### Available Tools

${catalogue}`
}
