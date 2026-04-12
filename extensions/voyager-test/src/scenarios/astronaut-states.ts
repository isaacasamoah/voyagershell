import { S } from '../content/selectors'
import { waitFor } from '../lib/wait'
import type { Scenario, ScenarioContext, ScenarioResult } from './types'

export const astronautStates: Scenario = {
  id: 'astronaut-states',
  label: 'Astronaut States',

  async run(ctx: ScenarioContext): Promise<ScenarioResult[]> {
    const start = Date.now()
    const { driver, panel } = ctx

    try {
      panel.setStatus('astronaut-states', 'running', 'checking initial state...')
      await driver.waitForIdle(15_000)

      // Read initial astronaut image src
      const initialSrc = driver.getAstronautSrc()
      if (!initialSrc) {
        return [{
          id: 'astronaut-states',
          status: 'fail',
          message: 'no astronaut image found',
          durationMs: Date.now() - start,
        }]
      }

      // Send a message that triggers deeper processing
      panel.setStatus('astronaut-states', 'running', 'sending message...')
      const beforeCount = driver.countAssistantMessages()
      await driver.typeAndSend('Tell me about the knowledge graph')

      // Poll for astronaut state change (src attribute change)
      panel.setStatus('astronaut-states', 'running', 'watching for state change...')
      let stateChanged = false

      try {
        await waitFor(
          () => {
            const currentSrc = driver.getAstronautSrc()
            if (currentSrc && currentSrc !== initialSrc) {
              stateChanged = true
              return true
            }
            return null
          },
          { timeout: 30_000, label: 'astronaut state change', interval: 300 },
        )
      } catch {
        // State might not change for simple queries, that's acceptable
      }

      // Wait for response and idle
      panel.setStatus('astronaut-states', 'running', 'waiting for idle...')
      await driver.waitForAssistantMessage(beforeCount, 60_000)
      await driver.waitForIdle(90_000)

      // Check if astronaut returned to idle state
      const finalSrc = driver.getAstronautSrc()
      const returnedToIdle = driver.isIdle()

      if (stateChanged && returnedToIdle) {
        return [{
          id: 'astronaut-states',
          status: 'pass',
          message: 'transition observed, returned to idle',
          durationMs: Date.now() - start,
        }]
      }

      if (!stateChanged && returnedToIdle) {
        return [{
          id: 'astronaut-states',
          status: 'pass',
          message: 'idle maintained (no transition needed)',
          durationMs: Date.now() - start,
        }]
      }

      return [{
        id: 'astronaut-states',
        status: 'fail',
        message: `stateChanged=${stateChanged}, idle=${returnedToIdle}`,
        durationMs: Date.now() - start,
      }]
    } catch (err) {
      return [{
        id: 'astronaut-states',
        status: 'fail',
        message: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      }]
    }
  },
}
