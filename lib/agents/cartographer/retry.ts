export const waitForCartographerRetry = async (
  attemptNumber: number,
  delayMs = 10,
): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, attemptNumber * delayMs))
}

export const runCartographerRetry = async <Result>(input: {
  maxAttempts: number
  run: (attemptNumber: number) => Promise<Result>
  isRetryable: (error: unknown) => boolean
  wait: (attemptNumber: number) => Promise<void>
  onExhausted: () => Promise<Result>
}): Promise<Result> => {
  for (let attemptNumber = 1; attemptNumber <= input.maxAttempts; attemptNumber++) {
    try {
      return await input.run(attemptNumber)
    } catch (error) {
      if (!input.isRetryable(error)) throw error
      if (attemptNumber < input.maxAttempts) {
        await input.wait(attemptNumber)
        continue
      }
      return input.onExhausted()
    }
  }
  throw new Error('cartographer_retry_loop_unreachable')
}
