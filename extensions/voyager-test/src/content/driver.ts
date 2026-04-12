import { S } from './selectors'
import { waitFor, waitForSelector, sleep } from '../lib/wait'

/**
 * UI driver that interacts with the VoyagerShell chat interface.
 * All methods use real DOM events to simulate user interaction.
 */
export class VoyagerDriver {
  /**
   * Type text into the chat textarea using React's native value setter
   * to ensure React state stays in sync.
   */
  async typeText(text: string): Promise<void> {
    const textarea = await waitForSelector<HTMLTextAreaElement>(S.chatInput, {
      label: 'chat input textarea',
      timeout: 10_000,
    })

    textarea.focus()

    const nativeInputSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!

    nativeInputSetter.call(textarea, text)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))

    // Brief pause to let React process
    await sleep(50)
  }

  /** Press Enter to submit the current message. */
  async pressEnter(): Promise<void> {
    const textarea = await waitForSelector<HTMLTextAreaElement>(S.chatInput, {
      label: 'chat input textarea',
      timeout: 5_000,
    })

    textarea.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
      }),
    )

    await sleep(100)
  }

  /** Type a message and press Enter to send it. */
  async typeAndSend(text: string): Promise<void> {
    await this.typeText(text)
    await this.pressEnter()
  }

  /** Count the current number of assistant messages visible. */
  countAssistantMessages(): number {
    return document.querySelectorAll(S.assistantLabel).length
  }

  /** Count the current number of user messages visible. */
  countUserMessages(): number {
    return document.querySelectorAll(S.userMessage).length
  }

  /**
   * Wait for a new assistant message to appear after the given count.
   * Returns the text content of the new message's parent container.
   */
  async waitForAssistantMessage(
    afterCount: number,
    timeout = 60_000,
  ): Promise<string> {
    const container = await waitFor(
      () => {
        const labels = document.querySelectorAll(S.assistantLabel)
        if (labels.length > afterCount) {
          // Walk up to find the message container
          const label = labels[labels.length - 1]
          const messageBlock = label.closest('div.space-y-4') ?? label.parentElement
          return messageBlock
        }
        return null
      },
      { timeout, label: 'new assistant message', interval: 500 },
    )

    return container.textContent?.trim() ?? ''
  }

  /**
   * Wait for the UI to return to idle state (green pulsing arrow).
   */
  async waitForIdle(timeout = 90_000): Promise<void> {
    await waitFor(
      () => document.querySelector(S.idleArrow),
      { timeout, label: 'idle state (green arrow)', interval: 500 },
    )
  }

  /**
   * Wait for an active interactive component to appear.
   */
  async waitForComponent(timeout = 30_000): Promise<Element> {
    return waitForSelector(S.componentActive, {
      timeout,
      label: 'active component',
    })
  }

  /** Check if the UI is currently in idle state. */
  isIdle(): boolean {
    return document.querySelector(S.idleArrow) !== null
  }

  /** Check if the UI is currently streaming/loading. */
  isLoading(): boolean {
    return (
      document.querySelector(S.loadingArrow) !== null ||
      document.querySelector(S.streamCursor) !== null
    )
  }

  /** Check if an error is displayed. */
  hasError(): boolean {
    return document.querySelector(S.errorBox) !== null
  }

  /** Get the current astronaut image src, if any. */
  getAstronautSrc(): string | null {
    const img = document.querySelector<HTMLImageElement>(S.astronautImg)
    return img?.src ?? null
  }

  /** Click the first matching element. */
  async clickElement(selector: string, timeout = 10_000): Promise<void> {
    const el = await waitForSelector<HTMLElement>(selector, {
      timeout,
      label: `clickable: ${selector}`,
    })
    el.click()
    await sleep(100)
  }
}
