import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '..'),
    },
  },
  test: {
    environment: 'node',
    env: {
      K5A_BOUNDARY_TIMING: '1',
    },
    include: ['recipes/cartographer-k5a-floor-boundary.measurement.ts'],
    testTimeout: 60_000,
  },
})
