import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const checker = resolve(process.cwd(), 'recipes/installed-precondition-live.sh')
const composer = resolve(process.cwd(), 'recipes/lib/installed-precondition.sh')
const fragments = [
  'recipes/sql/installed-pre-054-precondition/expectations.sql',
  'recipes/sql/installed-pre-054-precondition/catalog.sql',
  'recipes/sql/installed-pre-054-precondition/verdict.sql',
]
const contract = fragments
  .map((path) => readFileSync(resolve(process.cwd(), path), 'utf8'))
  .join('')
const checkerSource = readFileSync(checker, 'utf8')

const runChecker = (
  response: string,
  overrides: Record<string, string | undefined> = {},
) => {
  const mockBin = mkdtempSync(join(tmpdir(), 'voyager-installed-live-contract.'))
  const curlPath = join(mockBin, 'curl')
  const curlLog = join(mockBin, 'curl.log')
  const requestLog = join(mockBin, 'request.json')
  const responsePath = join(mockBin, 'response.json')
  writeFileSync(responsePath, response)
  writeFileSync(curlPath, [
    '#!/bin/sh',
    'printf \'%s\\n\' "$@" > "$MOCK_CURL_LOG"',
    'output=',
    'while [ "$#" -gt 0 ]; do',
    '  if [ "$1" = --output ]; then output="$2"; shift 2; else shift; fi',
    '  if [ "${1:-}" = --data-binary ]; then',
    '    cp "${2#@}" "$MOCK_REQUEST_LOG"',
    '    shift 2',
    '  fi',
    'done',
    'if [ -n "$output" ]; then cp "$MOCK_RESPONSE" "$output"; fi',
    'exit "${MOCK_CURL_EXIT:-0}"',
    '',
  ].join('\n'))
  chmodSync(curlPath, 0o700)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${mockBin}:/usr/bin:/bin`,
    MOCK_CURL_LOG: curlLog,
    MOCK_REQUEST_LOG: requestLog,
    MOCK_RESPONSE: responsePath,
    VOYAGER_SUPABASE_ACCESS_TOKEN: 'sensitive-token-value',
    VOYAGER_SUPABASE_PROJECT_REF: 'sensitive-project-ref',
    ...overrides,
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key]
  }
  const result = spawnSync('/bin/bash', [checker], { encoding: 'utf8', env })
  const curlArgs = existsSync(curlLog) ? readFileSync(curlLog, 'utf8') : ''
  const request = existsSync(requestLog) ? readFileSync(requestLog, 'utf8') : ''
  rmSync(mockBin, { recursive: true, force: true })
  return { curlArgs, request, result }
}

describe('live installed precondition checker', () => {
  it('uses one read-only catalogue contract with the observed pre-054 facts', () => {
    const composed = spawnSync('/bin/bash', [
      '-c',
      'source "$1"; installed_precondition_compose "$2"',
      'compose-installed-precondition',
      composer,
      process.cwd(),
    ], { encoding: 'utf8' })
    expect(composed.status).toBe(0)
    expect(composed.stdout).toBe(contract)
    const executableSql = contract
      .replace(/^--.*$/gm, '')
      .replace(/'(?:''|[^'])*'/g, "''")
    expect(executableSql).not.toMatch(
      /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|DO)\b/i,
    )
    for (const table of [
      'knowledge_current', 'knowledge_events', 'knowledge_edges',
      'message_deliveries', 'private_reply_promotions', 'profiles', 'voyages',
      'voyage_members', 'spaces', 'space_members', 'sessions',
    ]) expect(contract).toContain(`('${table}')`)
    for (const fact of [
      'update_knowledge_embedding', 'create_knowledge_event',
      'get_knowledge_pending_embedding', 'quiet_knowledge', 'pin_knowledge',
      'get_or_create_active_session', 'get_resumable_sessions', 'resume_session',
      'transition_session', 'mark_session_extracted', 'set_session_title',
      'search_knowledge', 'keyword_search', 'scoped_knowledge_fetch', 'graph_traverse',
      'search_memories', 'supersede_memory', 'vector(1536)',
      'unexpected_function_identity', 'allowed_cleanup_functions',
      'attention_score', 'expected_defaults', 'promotion_foreign_keys', 'invite_code',
      'event_projection_trigger', 'voyage_invite_identity',
      'INSTALLED_PRE_054_PRECONDITION_GREEN',
    ]) expect(contract).toContain(fact)
    expect(contract).toContain('enum_row.enumlabel::text')
    expect(contract).toContain(
      "('search_memories', 'vector, uuid, double precision, integer')",
    )
    expect(contract).toContain(
      "('supersede_memory', 'uuid, text, vector, double precision')",
    )
    expect(contract).toMatch(
      /unexpected_cleanup_function:[\s\S]*NOT EXISTS \([\s\S]*allowed_cleanup_functions/,
    )
    expect(contract).not.toContain('::pg_catalog.regclass')
    expect(contract).toContain(
      "has_table_privilege(\n      expected.role_name,\n      pg_catalog.to_regclass('public.' || expected.table_name)",
    )
    for (const exactDimension of [
      'expected_triggers', 'actual_triggers', 'trigger_type',
      'function_name <> expected.function_name',
      'expected_foreign_keys', 'actual_foreign_keys', 'referenced_table',
      'referenced_columns', 'delete_action', 'is_deferrable', 'is_deferred',
      'expected_checks', 'actual_checks', 'check_expression', 'key_columns',
      "columns = ARRAY['invite_code']",
    ]) expect(contract).toContain(exactDimension)
    expect(contract).toContain(
      'constraint_row.condeferrable AS is_deferrable',
    )
    expect(contract).toContain(
      'constraint_row.condeferred AS is_deferred',
    )
    expect(contract).toContain(
      "('knowledge_events', 'on_knowledge_event_insert',",
    )
    expect(contract).toContain(
      "'apply_knowledge_event', 5::smallint, 'O'::\"char\")",
    )
    expect(contract).toContain(
      "ARRAY['shared_event_id']::text[], 'knowledge_events', ARRAY['id']::text[]",
    )
    expect(contract).toContain(
      "('space_members', 'state', '''active''::text')",
    )
    expect(contract).toContain(
      "(state = ANY (ARRAY[''invited''::text, ''active''::text, ''left''::text]))",
    )
    expect(contract).toContain(
      "SELECT count(*) FROM actual_foreign_keys",
    )
    expect(contract).toContain("failure LIKE 'missing_table:%'")
    expect(contract).toContain('failure COLLATE "C"')
  })

  it('fails before curl when either required environment value is missing', () => {
    const noToken = runChecker('[]', {
      VOYAGER_SUPABASE_ACCESS_TOKEN: undefined,
    })
    expect(noToken.result.status).toBe(1)
    expect(noToken.result.stderr).toContain('VOYAGER_SUPABASE_ACCESS_TOKEN is required')
    expect(noToken.curlArgs).toBe('')

    const noProject = runChecker('[]', {
      VOYAGER_SUPABASE_PROJECT_REF: undefined,
    })
    expect(noProject.result.status).toBe(1)
    expect(noProject.result.stderr).toContain('VOYAGER_SUPABASE_PROJECT_REF is required')
    expect(noProject.curlArgs).toBe('')
  })

  it('rejects header-breaking tokens before curl', () => {
    for (const token of ['first\nInjected: value', 'first\rInjected: value']) {
      const invalid = runChecker('[]', {
        VOYAGER_SUPABASE_ACCESS_TOKEN: token,
      })
      expect(invalid.result.status).toBe(1)
      expect(invalid.result.stderr).toContain(
        'VOYAGER_SUPABASE_ACCESS_TOKEN is invalid',
      )
      expect(invalid.result.stdout + invalid.result.stderr)
        .not.toContain('Injected: value')
      expect(invalid.curlArgs).toBe('')
    }
  })

  it('uses only the exact read-only endpoint and submits the shared composition', () => {
    const { curlArgs, request, result } = runChecker(
      '[{"precondition_marker":"INSTALLED_PRE_054_PRECONDITION_GREEN"}]',
    )
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('INSTALLED_PRE_054_PRECONDITION_GREEN\n')
    expect(result.stderr).toBe('')
    expect(curlArgs.startsWith('--disable\n')).toBe(true)
    expect(curlArgs).toContain(
      'https://api.supabase.com/v1/projects/sensitive-project-ref/database/query/read-only\n',
    )
    expect(curlArgs).not.toContain(
      'https://api.supabase.com/v1/projects/sensitive-project-ref/database/query\n',
    )
    expect(curlArgs).toContain('--header\n@')
    expect(curlArgs).not.toContain('sensitive-token-value')
    expect(checkerSource).toContain('/database/query/read-only"')
    expect(checkerSource).not.toMatch(/\/database\/query"\s*$/m)
    expect(JSON.parse(request)).toEqual({ query: contract })
    expect(result.stdout + result.stderr).not.toContain('sensitive-project-ref')
  })

  it('fails closed on HTTP failure and redacts response and environment values', () => {
    const { result } = runChecker(
      '{"error":"sensitive-token-value sensitive-project-ref"}',
      { MOCK_CURL_EXIT: '22' },
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Management API request failed')
    expect(result.stdout + result.stderr).not.toContain('sensitive-token-value')
    expect(result.stdout + result.stderr).not.toContain('sensitive-project-ref')
  })

  it('fails closed on malformed or non-green responses without echoing them', () => {
    for (const response of [
      'not-json sensitive-token-value sensitive-project-ref',
      '[{"precondition_marker":"WRONG","detail":"sensitive-token-value"}]',
      '[{"precondition_marker":"INSTALLED_PRE_054_PRECONDITION_GREEN","extra":true}]',
    ]) {
      const { result } = runChecker(response)
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('returned a malformed precondition verdict')
      expect(result.stdout + result.stderr).not.toContain('sensitive-token-value')
      expect(result.stdout + result.stderr).not.toContain('sensitive-project-ref')
    }
  })

  it('surfaces only a bounded specific failed-precondition identifier', () => {
    for (const failureId of ['column:sessions.updated_at', 'voyage_invite_identity']) {
      const { result } = runChecker(JSON.stringify([{ precondition_marker: failureId }]))
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(`precondition failed: ${failureId}`)
      expect(result.stdout + result.stderr).not.toContain('sensitive-token-value')
      expect(result.stdout + result.stderr).not.toContain('sensitive-project-ref')
    }
  })
})
