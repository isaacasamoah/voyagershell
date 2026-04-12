import { VoyagerDriver } from './driver'
import { TestPanel } from './panel'
import { scenarios, allScenarioEntries } from '../scenarios/registry'
import type { ScenarioResult } from '../scenarios/types'

/** Content script entry point. */
function main(): void {
  const driver = new VoyagerDriver()
  const entries = allScenarioEntries()
  const panel = new TestPanel(entries)

  let abortController: AbortController | null = null

  panel.onRun = async () => {
    // Reset all statuses
    panel.resetAll()

    abortController = new AbortController()
    const { signal } = abortController

    for (const scenario of scenarios) {
      if (signal.aborted) break

      // Mark sub-scenarios or the scenario itself as running
      const ids = scenario.subIds?.map((s) => s.id) ?? [scenario.id]
      for (const id of ids) {
        panel.setStatus(id, 'running')
      }

      // Run with timeout protection (3 minutes per scenario)
      let results: ScenarioResult[]
      try {
        results = await withTimeout(
          scenario.run({ driver, panel, signal }),
          180_000,
          `Scenario ${scenario.id} timed out`,
        )
      } catch (err) {
        // Timeout or unexpected error
        results = ids.map((id) => ({
          id,
          status: 'fail' as const,
          message: err instanceof Error ? err.message : String(err),
          durationMs: 0,
        }))
      }

      // Update panel with results
      for (const result of results) {
        panel.setStatus(result.id, result.status, result.message)
      }
    }

    abortController = null
  }

  panel.onStop = () => {
    abortController?.abort()
    abortController = null
  }

  // Listen for toggle messages from the service worker
  chrome.runtime.onMessage.addListener(
    (message: { type: string }, _sender, _sendResponse) => {
      if (message.type === 'TOGGLE_PANEL') {
        panel.toggle()
      }
    },
  )

  console.log('[voyager-test] Extension loaded. Click the extension icon to toggle the test panel.')
}

/** Wrap a promise with a timeout. */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMessage: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorMessage)), ms)
    promise
      .then((val) => {
        clearTimeout(timer)
        resolve(val)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

main()
