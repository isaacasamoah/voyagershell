import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const trackedTypeScript = (): string[] => execFileSync(
  'git',
  ['ls-files', '*.ts', '*.tsx'],
  { encoding: 'utf8' },
).trim().split('\n').filter(Boolean)

const productionFiles = (): string[] => trackedTypeScript().filter((file) => (
  !file.startsWith('.claude/')
  && !file.startsWith('scripts/')
  && !file.endsWith('.test.ts')
  && !file.endsWith('.contract.test.ts')
  && !file.includes('-test-fixture')
))

const filesCalling = (pattern: RegExp): string[] => productionFiles()
  .filter((file) => pattern.test(readFileSync(file, 'utf8')))
  .sort()

describe('model lane contract', () => {
  it('keeps every generation call behind principal-aware resolution', () => {
    expect(filesCalling(/\b(?:generateText|generateObject|streamText)\s*\(/)).toEqual([
      'lib/agents/cartographer/extractor.ts',
      'lib/agents/deep-retrieval.ts',
      'lib/harness/run-turn.ts',
    ])
    expect(readFileSync('lib/agents/cartographer.ts', 'utf8'))
      .toContain('resolveUserModelWithMeta')
    expect(readFileSync('lib/agents/deep-retrieval.ts', 'utf8'))
      .toContain('resolveUserModelWithMeta')
    expect(readFileSync('lib/harness/run-turn.ts', 'utf8'))
      .toContain('resolveUserModelWithMeta')
  })

  it('keeps every embedding call on the OpenAI API-key client', () => {
    const embeddingFiles = filesCalling(/\.embeddings\.create\s*\(/)
    expect(embeddingFiles).toEqual([
      'lib/agents/cartographer/apply.ts',
      'lib/agents/cartographer/preference-superseding.ts',
      'lib/knowledge/event-storage.ts',
      'lib/knowledge/search.ts',
    ])
    for (const file of embeddingFiles) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toContain('CODEX_BACKEND_BASE')
      expect(source).not.toContain('resolveUserModel')
    }
    expect(readFileSync('lib/agents/cartographer/embeddings.ts', 'utf8'))
      .toContain('new OpenAI()')
  })
})
