import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8')

const FROZEN_PAYLOAD_SHA256 =
  '47f188f48fde5ad93df3e7a8bcd5de03108fc074f17d05b981e4edd8a665345a'

const corpus = JSON.parse(read(
  'recipes/experiments/k5a-c5-extraction-corpus-v2.json',
)) as {
  version: string
  meta: { freeze: { payloadSha256: string } }
  cases: unknown[]
}
const harness = read('recipes/experiments/k5a-c5-extraction-harness.ts')

// Mirrors the harness's canonicalize + hash so a corpus edit is caught offline,
// with no model auth and no spend. A mirror is only worth having while it stays
// a mirror, so the harness's own construction is pinned below: drift there
// turns this file red instead of letting the recompute quietly seal nothing.
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }
  return value
}

const recomputedPayloadSha256 = (): string => createHash('sha256')
  .update(`${JSON.stringify(canonicalize({
    version: corpus.version,
    cases: corpus.cases,
  }))}\n`)
  .digest('hex')

describe('K5a C5 corpus seal', () => {
  it('recomputes the frozen payload hash from the corpus cases', () => {
    expect(recomputedPayloadSha256()).toBe(FROZEN_PAYLOAD_SHA256)
    expect(corpus.meta.freeze.payloadSha256).toBe(FROZEN_PAYLOAD_SHA256)
    expect(corpus.version).toBe('k5a-c5-labelled-v2')
    expect(corpus.cases).toHaveLength(81)
  })

  it('keeps the recompute a faithful mirror of the harness gate', () => {
    expect(harness).toContain(
      'if (Array.isArray(value)) return value.map(canonicalize)',
    )
    expect(harness).toContain(
      '.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)',
    )
    expect(harness).toContain('JSON.stringify(canonicalize({\n'
      + '    version: corpus.version,\n'
      + '    cases: corpus.cases,\n'
      + '  }))}\\n`')
    expect(harness).toContain("createHash('sha256')")
    expect(harness).toContain(`const expectedPayloadSha256 =\n  '${
      FROZEN_PAYLOAD_SHA256}'`)
    expect(harness).toContain('k5a_c5_corpus_payload_changed')
  })
})
