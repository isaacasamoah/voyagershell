import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const checker = resolve(process.cwd(), 'scripts/check-changed-file-lines.sh')
const explicitGeneratedLocks = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
]
const extensionExcludedLock = 'yarn.lock'

const run = (cwd: string, command: string, args: string[]) =>
  spawnSync(command, args, { cwd, encoding: 'utf8' })

const runGit = (cwd: string, args: string[]) => {
  const result = run(cwd, 'git', args)
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  }
}

const writeLines = (path: string, count: number) => {
  mkdirSync(dirname(path), { recursive: true })
  const body = Array.from({ length: count }, (_, index) => `line-${index + 1}`)
  writeFileSync(path, `${body.join('\n')}\n`)
}

const createRepo = () => {
  const root = mkdtempSync(join(tmpdir(), 'voyager-line-cap-contract.'))
  runGit(root, ['init', '--quiet'])
  runGit(root, ['config', 'user.name', 'Line Cap Contract'])
  runGit(root, ['config', 'user.email', 'line-cap@example.invalid'])
  return root
}

const commitFixture = (root: string) => {
  runGit(root, ['add', '.'])
  runGit(root, ['commit', '--quiet', '-m', 'fixture'])
}

const runChecker = (root: string) => run(root, '/bin/bash', [checker, 'HEAD'])

const runWithFailingEnumerator = (enumerator: 'diff' | 'ls-files') => {
  const root = mkdtempSync(join(tmpdir(), 'voyager-line-cap-fake-git.'))
  const mockBin = join(root, 'bin')
  const runtime = join(root, 'runtime')
  mkdirSync(mockBin)
  mkdirSync(runtime)
  writeFileSync(join(mockBin, 'git'), [
    '#!/bin/sh',
    'case "$1" in',
    '  rev-parse) exit 0 ;;',
    '  diff)',
    '    [ "${FAIL_ENUMERATOR:-}" = diff ] || exit 0',
    '    printf \'controlled diff failure\\n\' >&2',
    '    exit 71',
    '    ;;',
    '  ls-files)',
    '    [ "${FAIL_ENUMERATOR:-}" = ls-files ] || exit 0',
    '    printf \'controlled ls-files failure\\n\' >&2',
    '    exit 72',
    '    ;;',
    '  *) exit 99 ;;',
    'esac',
    '',
  ].join('\n'))
  chmodSync(join(mockBin, 'git'), 0o700)
  const result = spawnSync('/bin/bash', [checker, 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      FAIL_ENUMERATOR: enumerator,
      PATH: `${mockBin}:${process.env.PATH ?? ''}`,
      TMPDIR: runtime,
    },
  })
  const runtimeEntries = readdirSync(runtime)
  rmSync(root, { recursive: true, force: true })
  return { result, runtimeEntries }
}

describe('changed-file line cap trust base', () => {
  it('excludes only generated dependency locks when tracked or untracked', () => {
    const root = createRepo()
    try {
      for (const lock of [...explicitGeneratedLocks, extensionExcludedLock]) {
        writeLines(join(root, 'tracked', lock), 1)
      }
      commitFixture(root)

      for (const lock of [...explicitGeneratedLocks, extensionExcludedLock]) {
        writeLines(join(root, 'tracked', lock), 300)
        writeLines(join(root, 'untracked', lock), 300)
      }
      writeLines(join(root, 'config', 'authored.json'), 10)

      const result = runChecker(root)
      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout).toContain(
        'Strict line cap passed: 1 changed files are all under 250 lines.',
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('still rejects oversized tracked and untracked authored JSON', () => {
    const root = createRepo()
    try {
      const tracked = join(root, 'config', 'tracked.json')
      writeLines(tracked, 1)
      commitFixture(root)

      writeLines(tracked, 250)
      const trackedResult = runChecker(root)
      expect(trackedResult.status).toBe(1)
      expect(trackedResult.stderr).toContain(
        'config/tracked.json has 250 lines; expected fewer than 250',
      )

      writeLines(tracked, 1)
      writeLines(join(root, 'config', 'custom-package-lock.json'), 250)
      const untrackedResult = runChecker(root)
      expect(untrackedResult.status).toBe(1)
      expect(untrackedResult.stderr).toContain(
        'config/custom-package-lock.json has 250 lines; expected fewer than 250',
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it.each([
    ['tracked change', 'diff', 'tracked changes'],
    ['untracked file', 'ls-files', 'untracked files'],
  ] as const)(
    'fails closed when the %s enumerator fails',
    (_label, enumerator, diagnostic) => {
      const { result, runtimeEntries } = runWithFailingEnumerator(enumerator)

      expect(result.status).toBe(2)
      expect(result.stderr).toContain(`failed to enumerate ${diagnostic}`)
      expect(result.stdout).not.toContain('Strict line cap passed')
      expect(result.stdout).not.toContain('0 changed files')
      expect(runtimeEntries).toEqual([])
    },
  )
})
