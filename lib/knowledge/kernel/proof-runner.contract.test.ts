import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const runnerPath = resolve(
  process.cwd(),
  'recipes/hosted/rollback/knowledge-graph-poc.sh',
)
const runner = readFileSync(runnerPath, 'utf8')
const hostedGuard = readFileSync(resolve(
  process.cwd(), 'recipes/lib/hosted-target.sh',
), 'utf8')
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
  const result = spawnSync('/bin/bash', [runnerPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${mockBin}:${process.env.PATH ?? ''}`,
      TMPDIR: runtime,
      MOCK_CURL_LOG: curlLog,
      VOYAGER_SUPABASE_ACCESS_TOKEN: 'sensitive-token-value',
      VOYAGER_SUPABASE_PROJECT_REF: 'developmentprojectref',
      VOYAGER_AUTHORIZED_SUPABASE_PROJECT_REF: 'developmentprojectref',
      VOYAGER_ALLOW_HOSTED_ROLLBACK: '1',
    },
    timeout: 10_000,
  })
  const curlArgs = existsSync(curlLog) ? readFileSync(curlLog, 'utf8') : ''
  const runtimeEntries = readdirSync(runtime)
  rmSync(root, { recursive: true, force: true })
  return { curlArgs, result, runtimeEntries }
}
describe('knowledge graph proof runner contract', () => {
  it('refuses a partial install of the migration-062 authorization helper', () => {
    expect(targetCatalog).toContain("'authorize_knowledge_scope'")
    expect(targetCatalog).not.toContain("'keyword_search'")
    expect(targetCatalog).not.toContain("'scoped_knowledge_fetch'")
  })

  it('rejects an unauthorized target before credential discovery or any API call', () => {
    const mockBin = mkdtempSync(join(tmpdir(), 'voyager-proof-refusal.'))
    const curlMarker = join(mockBin, 'curl-invoked')
    const curlPath = join(mockBin, 'curl')
    try {
      writeFileSync(curlPath, `#!/bin/sh\n: > '${curlMarker}'\nexit 97\n`)
      chmodSync(curlPath, 0o700)
      const refusal = spawnSync('bash', [runnerPath], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${mockBin}:${process.env.PATH ?? ''}`,
          VOYAGER_SUPABASE_ACCESS_TOKEN: 'must-not-be-read',
          VOYAGER_SUPABASE_PROJECT_REF: 'unexpectedprojectref',
          VOYAGER_AUTHORIZED_SUPABASE_PROJECT_REF: 'approveddevelopmentref',
          VOYAGER_ALLOW_HOSTED_ROLLBACK: '1',
        },
      })
      const guard = runner.indexOf('hosted_target_require knowledge-graph')
      const credential = runner.indexOf(
        'hosted_access_token_require knowledge-graph',
      )
      expect(refusal.status).toBe(3)
      expect(refusal.stderr).toContain('target is not explicitly authorized')
      expect(existsSync(curlMarker)).toBe(false)
      expect(guard).toBeGreaterThan(-1)
      expect(guard).toBeLessThan(credential)
      expect(guard).toBeLessThan(runner.indexOf('query_api() {'))
      expect(`${hostedGuard}\n${runner}`).not.toMatch(
        /CANONICAL_REF|\/Users\/|\/home\/|\bssh\b/,
      )
    } finally {
      rmSync(mockBin, { recursive: true, force: true })
    }
  })

  it('keeps the bearer secret out of curl arguments and the live shell', () => {
    const headerWrite = runner.indexOf('> "$TEMP_DIR/headers.txt"')
    const tokenUnset = runner.indexOf('unset ACCESS_TOKEN', headerWrite)
    const queryDefinition = runner.indexOf('query_api() {')
    const queryApi = runner.match(/query_api\(\) \{[\s\S]*?\n\}/)?.[0] ?? ''

    expect(runner).toContain('umask 077')
    expect(runner).toContain('set +x')
    expect(hostedGuard).toContain("*$'\\r'*|*$'\\n'*")
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

  it('requires an injected token and contains no credential fallback', () => {
    const result = spawnSync('/bin/bash', [runnerPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        VOYAGER_SUPABASE_PROJECT_REF: 'developmentprojectref',
        VOYAGER_AUTHORIZED_SUPABASE_PROJECT_REF: 'developmentprojectref',
        VOYAGER_ALLOW_HOSTED_ROLLBACK: '1',
        VOYAGER_SUPABASE_ACCESS_TOKEN: '',
      },
    })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('VOYAGER_SUPABASE_ACCESS_TOKEN is required')
    expect(`${hostedGuard}\n${runner}`).not.toMatch(
      /access-token|\/Users\/|\/home\/|\bssh\b/,
    )
  })

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
