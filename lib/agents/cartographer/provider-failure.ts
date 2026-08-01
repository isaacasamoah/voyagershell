import type { ExtractionFailureKind } from './types'

const STRUCTURED_OUTPUT_ERROR_NAMES = ['NoObjectGenerated', 'TypeValidation'] as const

export const classifyProviderFailure = (
  error: unknown,
  options: { malformedErrorNames?: readonly string[] } = {},
): ExtractionFailureKind => {
  const name = error instanceof Error ? error.name : ''
  return (
    STRUCTURED_OUTPUT_ERROR_NAMES.some((fragment) => name.includes(fragment))
    || options.malformedErrorNames?.includes(name)
  )
    ? 'malformed_output'
    : 'provider_failed'
}
