import type { Scenario } from './types'
import { basicChat } from './basic-chat'
import { captainTools } from './captain-tools'
import { astronautStates } from './astronaut-states'

/** All registered test scenarios in execution order. */
export const scenarios: Scenario[] = [
  basicChat,
  captainTools,
  astronautStates,
]

/**
 * Flat list of all scenario and sub-scenario IDs with labels.
 * Used by the panel to render the full list.
 */
export const allScenarioEntries = (): Array<{ id: string; label: string }> => {
  const entries: Array<{ id: string; label: string }> = []
  for (const s of scenarios) {
    if (s.subIds && s.subIds.length > 0) {
      entries.push(...s.subIds)
    } else {
      entries.push({ id: s.id, label: s.label })
    }
  }
  return entries
}
