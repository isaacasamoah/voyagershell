import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const runnerPath = resolve(process.cwd(), 'recipes/knowledge-graph-poc.sh')
const runner = readFileSync(runnerPath, 'utf8')
const transactionComposer = readFileSync(resolve(
  process.cwd(), 'recipes/lib/knowledge-graph-transaction.sh',
), 'utf8')
const targetCatalog = readFileSync(resolve(process.cwd(),
  'recipes/sql/knowledge-graph/catalog-targets.sql'), 'utf8')
const fullCatalog = readFileSync(resolve(process.cwd(),
  'recipes/sql/knowledge-graph/catalog-full.sql'), 'utf8')
const installedPrecondition = [
  'recipes/sql/installed-pre-054-precondition/expectations.sql',
  'recipes/sql/installed-pre-054-precondition/catalog.sql',
  'recipes/sql/installed-pre-054-precondition/verdict.sql',
].map((path) => readFileSync(resolve(process.cwd(), path), 'utf8')).join('')
const installedPostcondition = readFileSync(resolve(process.cwd(),
  'recipes/sql/installed-post-059-contract.sql'), 'utf8')
const runnerWithLocalTokenPath = (root: string, tokenPath: string) => {
  const originalScriptDir = 'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"'
  const source = runner
    .replace(
      originalScriptDir,
      `SCRIPT_DIR=${JSON.stringify(resolve(process.cwd(), 'recipes'))}`,
    )
    .replaceAll('/Users/isaac/.supabase/access-token', tokenPath)
  if (source === runner) throw new Error('hosted proof runner fixture replacement failed')
  const path = join(root, 'knowledge-graph-poc.sh')
  writeFileSync(path, source)
  return path
}
const runHostedWithMockCurl = (curlBody: string) => {
  const root = mkdtempSync(join(tmpdir(), 'voyager-hosted-proof-contract.'))
  const mockBin = join(root, 'bin')
  const runtime = join(root, 'runtime')
  const curlLog = join(root, 'curl.log')
  mkdirSync(mockBin)
  mkdirSync(runtime)
  const curlPath = join(mockBin, 'curl')
  writeFileSync(curlPath, [
    '#!/bin/sh',
    'printf \'%s\\n\' "$@" > "$MOCK_CURL_LOG"',
    curlBody,
    '',
  ].join('\n'))
  chmodSync(curlPath, 0o700)
  const result = spawnSync('/bin/bash', [runnerPath, 'disposableproofref'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${mockBin}:${process.env.PATH ?? ''}`,
      TMPDIR: runtime,
      MOCK_CURL_LOG: curlLog,
      VOYAGER_SUPABASE_ACCESS_TOKEN: 'sensitive-token-value',
    },
    timeout: 10_000,
  })
  const curlArgs = existsSync(curlLog) ? readFileSync(curlLog, 'utf8') : ''
  const runtimeEntries = readdirSync(runtime)
  rmSync(root, { recursive: true, force: true })
  return { curlArgs, result, runtimeEntries }
}
const runWithNoNewlineToken = (source: 'local' | 'remote') => {
  const root = mkdtempSync(join(tmpdir(), 'voyager-token-file-contract.'))
  const mockBin = join(root, 'bin'), runtime = join(root, 'runtime')
  const curlLog = join(root, 'curl.log'), sshLog = join(root, 'ssh.log')
  const tokenPath = join(root, source === 'local' ? 'access-token' : 'missing-token')
  const sensitiveToken = 'no-newline-sensitive-token'
  mkdirSync(mockBin); mkdirSync(runtime)
  if (source === 'local') writeFileSync(tokenPath, sensitiveToken)
  writeFileSync(join(mockBin, 'curl'),
    '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$MOCK_CURL_LOG"\nexit 22\n')
  chmodSync(join(mockBin, 'curl'), 0o700)
  if (source === 'remote') {
    writeFileSync(join(mockBin, 'ssh'),
      '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$MOCK_SSH_LOG"\nprintf %s "$MOCK_SSH_TOKEN"\n')
    chmodSync(join(mockBin, 'ssh'), 0o700)
  }
  const fixtureRunner = runnerWithLocalTokenPath(root, tokenPath)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${mockBin}:${process.env.PATH ?? ''}`,
    TMPDIR: runtime, MOCK_CURL_LOG: curlLog, MOCK_SSH_LOG: sshLog,
    MOCK_SSH_TOKEN: sensitiveToken,
  }
  delete env.VOYAGER_SUPABASE_ACCESS_TOKEN
  const result = spawnSync('/bin/bash', [fixtureRunner, 'disposableproofref'], {
    encoding: 'utf8', env, timeout: 10_000,
  })
  const curlArgs = existsSync(curlLog) ? readFileSync(curlLog, 'utf8') : ''
  const sshArgs = existsSync(sshLog) ? readFileSync(sshLog, 'utf8') : ''
  const runtimeEntries = readdirSync(runtime)
  rmSync(root, { recursive: true, force: true })
  return { curlArgs, result, runtimeEntries, sensitiveToken, sshArgs }
}
describe('knowledge graph proof runner contract', () => {
  it('refuses a partial install of the migration-062 authorization helper', () => {
    expect(targetCatalog).toContain("'authorize_knowledge_scope'")
    expect(targetCatalog).not.toContain("'keyword_search'")
    expect(targetCatalog).not.toContain("'scoped_knowledge_fetch'")
  })

  it('rejects the canonical project before credential discovery or any API call', () => {
    const mockBin = mkdtempSync(join(tmpdir(), 'voyager-proof-refusal.'))
    const curlMarker = join(mockBin, 'curl-invoked')
    const curlPath = join(mockBin, 'curl')
    try {
      writeFileSync(curlPath, `#!/bin/sh\n: > '${curlMarker}'\nexit 97\n`)
      chmodSync(curlPath, 0o700)
      const refusal = spawnSync('bash', [runnerPath, 'iesprdzzgjypnksoljym'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${mockBin}:${process.env.PATH ?? ''}`,
          VOYAGER_SUPABASE_ACCESS_TOKEN: 'must-not-be-read',
        },
      })
      const guard = runner.indexOf('[ "$PROJECT_REF" = "$CANONICAL_REF" ]')
      expect(refusal.status).toBe(3)
      expect(refusal.stderr).toContain('canonical project ref is forbidden')
      expect(existsSync(curlMarker)).toBe(false)
      expect(guard).toBeGreaterThan(-1)
      expect(guard).toBeLessThan(runner.indexOf('for command_name in curl jq'))
      expect(guard).toBeLessThan(runner.indexOf('VOYAGER_SUPABASE_ACCESS_TOKEN:-'))
      expect(guard).toBeLessThan(runner.indexOf('query_api() {'))
      expect(runner).not.toMatch(/PROJECT_REF=iesprdzzgjypnksoljym/)
    } finally {
      rmSync(mockBin, { recursive: true, force: true })
    }
  })

  it('keeps the bearer secret out of curl arguments and the live shell', () => {
    const headerWrite = runner.indexOf('> "$TEMP_DIR/headers.txt"')
    const tokenUnset = runner.indexOf('unset ACCESS_TOKEN VOYAGER_SUPABASE_ACCESS_TOKEN', headerWrite)
    const queryDefinition = runner.indexOf('query_api() {')
    const queryApi = runner.match(/query_api\(\) \{[\s\S]*?\n\}/)?.[0] ?? ''

    expect(runner).toContain('umask 077')
    expect(runner).toContain('set +x')
    expect(runner).toContain("*$'\\r'*|*$'\\n'*")
    expect(runner).toContain('chmod 600 "$TEMP_DIR/headers.txt"')
    expect(headerWrite).toBeGreaterThan(-1)
    expect(tokenUnset).toBeGreaterThan(headerWrite)
    expect(queryDefinition).toBeGreaterThan(tokenUnset)
    expect(queryApi).toContain('curl --disable')
    expect(queryApi).toContain('--header "@$TEMP_DIR/headers.txt"')
    expect(queryApi).not.toContain('ACCESS_TOKEN')
    expect(queryApi).not.toContain('Authorization: Bearer')
    expect(runner).not.toContain('--header "Authorization: Bearer')
  })

  it('redacts reflected API failures and ignores user curl configuration', () => {
    const { curlArgs, result } = runHostedWithMockCurl(
      'printf \'%s\\n\' \'{"error":"sensitive-token-value"}\'\nexit 22',
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Management API query failed')
    expect(result.stdout + result.stderr).not.toContain('sensitive-token-value')
    expect(curlArgs.startsWith('--disable\n')).toBe(true)
  })

  it('cleans credential-bearing temporary files when interrupted', () => {
    const { result, runtimeEntries } = runHostedWithMockCurl(
      'kill -TERM "$PPID"\nsleep 1\nexit 0',
    )
    expect(result.status).toBe(130)
    expect(runtimeEntries).toEqual([])
  })

  it.each(['local', 'remote'] as const)(
    'accepts a nonempty %s token file without a final newline under /bin/bash',
    (source) => {
      const {
        curlArgs, result, runtimeEntries, sensitiveToken, sshArgs,
      } = runWithNoNewlineToken(source)
      const combinedOutput = result.stdout + result.stderr
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Management API query failed')
      expect(curlArgs).not.toBe('')
      expect(curlArgs).not.toContain(sensitiveToken)
      expect(combinedOutput).not.toContain(sensitiveToken)
      expect(runtimeEntries).toEqual([])
      if (source === 'remote') {
        expect(sshArgs).toContain('-o\nConnectTimeout=15\n')
        expect(sshArgs).toContain('-o\nConnectionAttempts=1\n')
      }
    },
  )

  it('fingerprints aggregate and window catalogue rows without rendering them as functions', () => {
    expect(fullCatalog.match(/pg_get_functiondef\(p\.oid\)/g)).toHaveLength(1)
    expect(fullCatalog).toContain("CASE WHEN p.prokind IN ('f','p')")
    expect(fullCatalog).toContain('ELSE md5(to_jsonb(p)::text) END')
    expect(fullCatalog).toContain("FROM pg_catalog.pg_proc p")
    expect(fullCatalog).not.toContain("WHERE n.nspname='public' AND p.prokind")
  })

  it('checks the installed precondition before 054 and the scoped postcondition after 059', () => {
    const preconditionCall = runner.indexOf(
      'query_api "$INSTALLED_PRECONDITION" "$TEMP_DIR/precondition-response.json"',
    )
    const compositionCall = runner.indexOf('compose_knowledge_graph_transaction')
    const productLoop = transactionComposer.indexOf(
      'for migration in "${PRODUCT_MIGRATIONS[@]}"',
    )
    const postconditionWrite = transactionComposer.indexOf(
      'sed -n \'1,$p\' "$INSTALLED_POSTCONDITION"',
    )
    const candidateLoop = transactionComposer.indexOf('for migration in "${MIGRATIONS[@]}"')
    expect(preconditionCall).toBeGreaterThan(-1)
    expect(runner).toContain(
      'installed_precondition_compose "$REPO_ROOT" > "$INSTALLED_PRECONDITION"',
    )
    expect(productLoop).toBeGreaterThan(-1)
    expect(compositionCall).toBeGreaterThan(preconditionCall)
    expect(postconditionWrite).toBeGreaterThan(productLoop)
    expect(candidateLoop).toBeGreaterThan(postconditionWrite)
    expect(runner).toContain('INSTALLED_PRE_054_PRECONDITION_GREEN')
    expect(runner).toContain('INSTALLED_POST_059_CONTRACT_GREEN')
    for (const dimension of [
      'expected_columns', 'expected_functions', 'prosecdef', 'aclexplode',
      'has_function_privilege',
    ]) {
      expect(installedPrecondition + installedPostcondition).toContain(dimension)
    }
  })

  it('accepts only the exact hosted transaction verdict without echoing failures', () => {
    expect(runner).toContain('. == [')
    expect(runner).toContain(
      '"postcondition_marker": "INSTALLED_POST_059_CONTRACT_GREEN"',
    )
    expect(runner).toContain('"verdict": "KNOWLEDGE_GRAPH_SQL_GREEN"')
    expect(runner).not.toContain('any(.[];')
    expect(runner).not.toContain(
      'jq -c \'.\' "$TEMP_DIR/transaction-response.json" >&2',
    )
    expect(runner).toContain(
      'knowledge-graph: transaction returned no exact green verdict',
    )
  })
})
