import { waitUntil } from '@vercel/functions'
import type { HarnessHost } from './types'

export const createVercelHost = (): HarnessHost => ({
  defer: (promise) => waitUntil(promise),
  now: () => new Date(),
})
