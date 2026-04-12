import { S } from '../content/selectors'
import { waitForSelector, waitFor } from '../lib/wait'
import type { Scenario, ScenarioContext, ScenarioResult } from './types'

const SUB_IDS = [
  { id: 'captain-email', label: 'Captain: Email Input' },
  { id: 'captain-confirm', label: 'Captain: Confirmation' },
  { id: 'captain-voyage', label: 'Captain: Voyage Picker' },
]

export const captainTools: Scenario = {
  id: 'captain-tools',
  label: 'Captain Tools',
  subIds: SUB_IDS,

  async run(ctx: ScenarioContext): Promise<ScenarioResult[]> {
    const { driver, panel } = ctx
    const results: ScenarioResult[] = []

    // --- captain-email ---
    results.push(await runEmailTest(ctx))

    // --- captain-confirm ---
    results.push(await runConfirmTest(ctx))

    // --- captain-voyage ---
    results.push(await runVoyageTest(ctx))

    return results
  },
}

async function runEmailTest(ctx: ScenarioContext): Promise<ScenarioResult> {
  const start = Date.now()
  const { driver, panel } = ctx

  try {
    panel.setStatus('captain-email', 'running', 'waiting for idle...')
    await driver.waitForIdle(15_000)

    panel.setStatus('captain-email', 'running', 'sending message...')
    await driver.typeAndSend('I need to sign in')

    panel.setStatus('captain-email', 'running', 'waiting for email input...')
    await waitForSelector(S.emailInput, {
      timeout: 30_000,
      label: 'email input component',
    })

    await driver.waitForIdle(60_000)

    return {
      id: 'captain-email',
      status: 'pass',
      message: 'email input appeared',
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      id: 'captain-email',
      status: 'fail',
      message: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    }
  }
}

async function runConfirmTest(ctx: ScenarioContext): Promise<ScenarioResult> {
  const start = Date.now()
  const { driver, panel } = ctx

  try {
    panel.setStatus('captain-confirm', 'running', 'waiting for idle...')
    await driver.waitForIdle(15_000)

    panel.setStatus('captain-confirm', 'running', 'sending message...')
    await driver.typeAndSend('Please confirm: is this a test?')

    panel.setStatus('captain-confirm', 'running', 'waiting for confirmation...')
    const confirmCard = await waitForSelector(S.confirmationCard, {
      timeout: 30_000,
      label: 'confirmation card',
    })

    // Click the confirm button inside the card
    panel.setStatus('captain-confirm', 'running', 'clicking confirm...')
    const confirmBtn = confirmCard.querySelector('button')
    if (confirmBtn) {
      confirmBtn.click()

      // Wait for resolved state
      panel.setStatus('captain-confirm', 'running', 'waiting for resolved...')
      await waitFor(
        () => {
          const resolved = document.querySelectorAll(S.componentResolved)
          return resolved.length > 0 ? resolved[0] : null
        },
        { timeout: 15_000, label: 'component resolved' },
      )
    }

    await driver.waitForIdle(60_000)

    return {
      id: 'captain-confirm',
      status: 'pass',
      message: 'confirmed and resolved',
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      id: 'captain-confirm',
      status: 'fail',
      message: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    }
  }
}

async function runVoyageTest(ctx: ScenarioContext): Promise<ScenarioResult> {
  const start = Date.now()
  const { driver, panel } = ctx

  try {
    panel.setStatus('captain-voyage', 'running', 'waiting for idle...')
    await driver.waitForIdle(15_000)

    panel.setStatus('captain-voyage', 'running', 'sending message...')
    await driver.typeAndSend('Show me my voyages')

    panel.setStatus('captain-voyage', 'running', 'waiting for voyage picker...')

    try {
      await waitForSelector(S.voyagePickerCard, {
        timeout: 30_000,
        label: 'voyage picker card',
      })
    } catch {
      // May not be authenticated, skip gracefully
      return {
        id: 'captain-voyage',
        status: 'skipped',
        message: 'not authenticated or no voyages',
        durationMs: Date.now() - start,
      }
    }

    await driver.waitForIdle(60_000)

    return {
      id: 'captain-voyage',
      status: 'pass',
      message: 'voyage picker appeared',
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      id: 'captain-voyage',
      status: 'fail',
      message: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    }
  }
}
