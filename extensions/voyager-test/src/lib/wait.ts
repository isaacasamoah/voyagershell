/** Sleep for the given number of milliseconds. */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** Options for polling-based waits. */
interface WaitOptions {
  /** Maximum time to wait in ms (default: 30000) */
  timeout?: number
  /** Polling interval in ms (default: 250) */
  interval?: number
  /** Human-readable label for timeout errors */
  label?: string
}

/**
 * Poll until a predicate returns a truthy value, then return it.
 * Throws on timeout.
 */
export const waitFor = async <T>(
  predicate: () => T | null | undefined,
  opts: WaitOptions = {},
): Promise<T> => {
  const { timeout = 30_000, interval = 250, label = 'condition' } = opts
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const result = predicate()
    if (result) return result
    await sleep(interval)
  }

  throw new Error(`Timed out waiting for: ${label} (${timeout}ms)`)
}

/**
 * Wait for a DOM element matching the selector to appear.
 * Returns the element.
 */
export const waitForSelector = <E extends Element = Element>(
  selector: string,
  opts: WaitOptions & { root?: ParentNode } = {},
): Promise<E> => {
  const root = opts.root ?? document
  return waitFor(
    () => root.querySelector<E>(selector),
    { ...opts, label: opts.label ?? `selector: ${selector}` },
  )
}

/**
 * Wait until a selector matches zero elements.
 */
export const waitForSelectorGone = async (
  selector: string,
  opts: WaitOptions & { root?: ParentNode } = {},
): Promise<void> => {
  const root = opts.root ?? document
  await waitFor(
    () => (root.querySelector(selector) === null ? true : null),
    { ...opts, label: opts.label ?? `selector gone: ${selector}` },
  )
}
