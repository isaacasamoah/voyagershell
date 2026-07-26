import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const runnerPath = resolve(process.cwd(), 'recipes/privacy-backstop-proof.sh')
const runner = readFileSync(runnerPath, 'utf8')

const runWithFailingCurl = () => {
  const root = mkdtempSync(join(tmpdir(), 'privacy-backstop-contract.'))
  const mockBin = join(root, 'bin')
  const runtime = join(root, 'runtime')
  const curlLog = join(root, 'curl.log')
  const response = join(root, 'response.json')
  mkdirSync(mockBin)
  mkdirSync(runtime)
  writeFileSync(response, '{"error":"sensitive-token-value"}\n')
  writeFileSync(
    join(mockBin, 'curl'),
    [
      '#!/bin/sh',
      'printf \'%s\\n\' "$@" > "$MOCK_CURL_LOG"',
      'output=',
      'while [ "$#" -gt 0 ]; do',
      '  if [ "$1" = --output ]; then output="$2"; shift 2; else shift; fi',
      'done',
      'cp "$MOCK_RESPONSE" "$output"',
      'exit 22',
      '',
    ].join('\n'),
  )
  chmodSync(join(mockBin, 'curl'), 0o700)
  const result = spawnSync('/bin/bash', [runnerPath], {
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      PATH: `${mockBin}:${process.env.PATH ?? ''}`,
      TMPDIR: runtime,
      MOCK_CURL_LOG: curlLog,
      MOCK_RESPONSE: response,
      VOYAGER_SUPABASE_ACCESS_TOKEN: 'sensitive-token-value',
    },
  })
  const curlArgs = existsSync(curlLog) ? readFileSync(curlLog, 'utf8') : ''
  const runtimeEntries = readdirSync(runtime)
  rmSync(root, { recursive: true, force: true })
  return { curlArgs, result, runtimeEntries }
}

const runTracedBeforeNetwork = () => {
  const root = mkdtempSync(join(tmpdir(), 'privacy-backstop-traced.'))
  const mockBin = join(root, 'bin')
  const runtime = join(root, 'runtime')
  const curlMarker = join(root, 'curl-invoked')
  mkdirSync(mockBin)
  mkdirSync(runtime)
  writeFileSync(
    join(mockBin, 'curl'),
    `#!/bin/sh\n: > '${curlMarker}'\nexit 97\n`,
  )
  writeFileSync(join(mockBin, 'python3'), '#!/bin/sh\nexit 91\n')
  chmodSync(join(mockBin, 'curl'), 0o700)
  chmodSync(join(mockBin, 'python3'), 0o700)
  const result = spawnSync('/bin/bash', ['-x', runnerPath], {
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      PATH: `${mockBin}:${process.env.PATH ?? ''}`,
      TMPDIR: runtime,
      VOYAGER_SUPABASE_ACCESS_TOKEN: 'traced-sensitive-token-value',
    },
  })
  const curlInvoked = existsSync(curlMarker)
  const runtimeEntries = readdirSync(runtime)
  rmSync(root, { recursive: true, force: true })
  return { curlInvoked, result, runtimeEntries }
}

const runWithInvalidToken = (controlCharacter: '\r' | '\n') => {
  const root = mkdtempSync(join(tmpdir(), 'privacy-backstop-invalid-token.'))
  const mockBin = join(root, 'bin')
  const runtime = join(root, 'runtime')
  const curlMarker = join(root, 'curl-invoked')
  mkdirSync(mockBin)
  mkdirSync(runtime)
  writeFileSync(
    join(mockBin, 'curl'),
    `#!/bin/sh\n: > '${curlMarker}'\nexit 97\n`,
  )
  chmodSync(join(mockBin, 'curl'), 0o700)
  const result = spawnSync('/bin/bash', [runnerPath], {
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      PATH: `${mockBin}:${process.env.PATH ?? ''}`,
      TMPDIR: runtime,
      VOYAGER_SUPABASE_ACCESS_TOKEN: `invalid${controlCharacter}token`,
    },
  })
  const curlInvoked = existsSync(curlMarker)
  const runtimeEntries = readdirSync(runtime)
  rmSync(root, { recursive: true, force: true })
  return { curlInvoked, result, runtimeEntries }
}

describe('privacy backstop proof runner contract', () => {
  it('bounds Fedora credential discovery and the Management API call', () => {
    expect(runner).toContain(
      'ssh -o BatchMode=yes -o ConnectTimeout=15 -o ConnectionAttempts=1 fedora',
    )
    expect(runner).toContain('--connect-timeout 15 --max-time 180')
  })

  it('ignores curl configuration first and redacts reflected failures', () => {
    const { curlArgs, result, runtimeEntries } = runWithFailingCurl()
    const combinedOutput = result.stdout + result.stderr

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Management API request failed')
    expect(combinedOutput).not.toContain('sensitive-token-value')
    expect(curlArgs).not.toContain('sensitive-token-value')
    expect(curlArgs.startsWith('--disable\n')).toBe(true)
    expect(curlArgs).toContain('--connect-timeout\n15\n')
    expect(curlArgs).toContain('--max-time\n180\n')
    expect(curlArgs).toContain('--header\n@')
    expect(curlArgs).not.toContain('Authorization: Bearer')
    expect(runtimeEntries).toEqual([])
  })

  it('disables tracing before credential access and cleans up before network', () => {
    const { curlInvoked, result, runtimeEntries } = runTracedBeforeNetwork()
    const combinedOutput = result.stdout + result.stderr
    const traceDisabled = runner.indexOf('set +x')
    const credentialAccess = runner.indexOf('VOYAGER_SUPABASE_ACCESS_TOKEN:-')

    expect(traceDisabled).toBeGreaterThan(-1)
    expect(traceDisabled).toBeLessThan(credentialAccess)
    expect(result.status).toBe(91)
    expect(combinedOutput).not.toContain('traced-sensitive-token-value')
    expect(curlInvoked).toBe(false)
    expect(runtimeEntries).toEqual([])
  })

  it.each([
    ['carriage return', '\r'],
    ['line feed', '\n'],
  ] as const)(
    'rejects a token containing a %s before header creation or curl',
    (_label, controlCharacter) => {
      const { curlInvoked, result, runtimeEntries } =
        runWithInvalidToken(controlCharacter)
      const tokenGuard = runner.indexOf('case "$ACCESS_TOKEN" in')
      const headerWrite = runner.indexOf('> "$TEMP_DIR/headers.txt"')

      expect(result.status).toBe(2)
      expect(result.stderr).toContain('invalid Supabase access token')
      expect(curlInvoked).toBe(false)
      expect(tokenGuard).toBeGreaterThan(-1)
      expect(tokenGuard).toBeLessThan(headerWrite)
      expect(runtimeEntries).toEqual([])
    },
  )
})
