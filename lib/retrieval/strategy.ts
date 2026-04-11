// Tool Strategy Composition
// Composes static preamble + dynamic per-tool hints into a strategy section
// for the system prompt. Module-ready: installed modules contribute both
// tool hints (via registrations) and their own skillPrompt block.

import { TOOL_STRATEGY_PREAMBLE } from '@/lib/prompts/core'
import type { ToolRegistration } from './tools'

export interface ModuleSkillPrompt {
  moduleId: string
  moduleName: string
  prompt: string
}

/**
 * Compose tool strategy from static preamble + dynamic tool registrations.
 * Produces a complete strategy section for the system prompt.
 *
 * If `moduleSkillPrompts` is non-empty, each active module's skillPrompt is
 * appended as its own labeled block below the tool catalogue so the model
 * sees module guidance alongside the tools that module provides.
 */
export const composeToolStrategy = (
  registrations: ToolRegistration[],
  moduleSkillPrompts: ModuleSkillPrompt[] = []
): string => {
  const catalogue = registrations
    .map((r) => `- **${r.name}**: ${r.strategyHint}`)
    .join('\n')

  let prompt = `${TOOL_STRATEGY_PREAMBLE}

### Available Tools

${catalogue}`

  if (moduleSkillPrompts.length > 0) {
    const moduleBlocks = moduleSkillPrompts
      .map(
        (m) =>
          `#### ${m.moduleName} (${m.moduleId})\n\n${m.prompt.trim()}`
      )
      .join('\n\n')

    prompt += `\n\n### Active Modules\n\n${moduleBlocks}`
  }

  return prompt
}
