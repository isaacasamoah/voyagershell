import type { Scenario, ScenarioContext, ScenarioResult } from './types'

export const basicChat: Scenario = {
  id: 'basic-chat',
  label: 'Basic Chat',

  async run(ctx: ScenarioContext): Promise<ScenarioResult[]> {
    const start = Date.now()
    const { driver } = ctx

    try {
      // Wait for idle state first
      ctx.panel.setStatus('basic-chat', 'running', 'waiting for idle...')
      await driver.waitForIdle(15_000)

      // Count existing messages
      const beforeCount = driver.countAssistantMessages()

      // Send a test message
      ctx.panel.setStatus('basic-chat', 'running', 'sending message...')
      await driver.typeAndSend('hello voyager, this is a test')

      // Wait for assistant response
      ctx.panel.setStatus('basic-chat', 'running', 'waiting for response...')
      const responseText = await driver.waitForAssistantMessage(beforeCount, 60_000)

      // Wait for idle again
      await driver.waitForIdle(90_000)

      // Assert non-empty response
      if (!responseText || responseText.length === 0) {
        return [{
          id: 'basic-chat',
          status: 'fail',
          message: 'Assistant response was empty',
          durationMs: Date.now() - start,
        }]
      }

      return [{
        id: 'basic-chat',
        status: 'pass',
        message: `${responseText.length} chars`,
        durationMs: Date.now() - start,
      }]
    } catch (err) {
      return [{
        id: 'basic-chat',
        status: 'fail',
        message: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      }]
    }
  },
}
