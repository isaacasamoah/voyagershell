import type { VoyagerDriver } from '../content/driver'
import type { TestPanel } from '../content/panel'

/** Result of a single scenario or sub-scenario run. */
export interface ScenarioResult {
  id: string
  status: 'pass' | 'fail' | 'skipped'
  message?: string
  durationMs: number
}

/** Context passed to every scenario function. */
export interface ScenarioContext {
  driver: VoyagerDriver
  panel: TestPanel
  signal: AbortSignal
}

/** A runnable test scenario. */
export interface Scenario {
  id: string
  label: string
  /** Sub-scenario IDs if this scenario has multiple steps. */
  subIds?: Array<{ id: string; label: string }>
  run: (ctx: ScenarioContext) => Promise<ScenarioResult[]>
}
