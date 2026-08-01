import { spawnSync } from 'node:child_process'
import {
  chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8')
const guard = read('recipes/lib/hosted-target.sh')
const handlesPath = resolve(
  process.cwd(), 'recipes/hosted/mutating/handles-uniqueness.sh',
)
const handles = read('recipes/hosted/mutating/handles-uniqueness.sh')

const runHandlesBeforeNetwork = (
  overrides: Record<string, string>,
) => {
  const root = mkdtempSync(join(tmpdir(), 'voyager-hosted-target.'))
  const curlMarker = join(root, 'curl-invoked')
  const curlPath = join(root, 'curl')
  writeFileSync(curlPath, `#!/bin/sh\n: > '${curlMarker}'\nexit 97\n`)
  chmodSync(curlPath, 0o700)
  const result = spawnSync('/bin/bash', [handlesPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${root}:${process.env.PATH ?? ''}`,
      VOYAGER_SUPABASE_PROJECT_REF: 'developmentprojectref',
      VOYAGER_AUTHORIZED_SUPABASE_PROJECT_REF: 'developmentprojectref',
      VOYAGER_ALLOW_HOSTED_MUTATION: '1',
      VOYAGER_SUPABASE_ACCESS_TOKEN: 'must-not-be-read',
      ...overrides,
    },
  })
  const curlInvoked = existsSync(curlMarker)
  rmSync(root, { recursive: true, force: true })
  return { curlInvoked, result }
}

describe('hosted target authorization', () => {
  it('requires the target to match a separately supplied authorization', () => {
    expect(guard).toContain('VOYAGER_AUTHORIZED_SUPABASE_PROJECT_REF')
    expect(guard).toContain('target is not explicitly authorized')
    const { curlInvoked, result } = runHandlesBeforeNetwork({
      VOYAGER_SUPABASE_PROJECT_REF: 'unexpectedprojectref',
    })
    expect(result.status).toBe(3)
    expect(result.stderr).toContain('target is not explicitly authorized')
    expect(curlInvoked).toBe(false)
  })

  it('requires an explicit mutation confirmation before credential access', () => {
    const { curlInvoked, result } = runHandlesBeforeNetwork({
      VOYAGER_ALLOW_HOSTED_MUTATION: '0',
    })
    expect(result.status).toBe(3)
    expect(result.stderr).toContain('VOYAGER_ALLOW_HOSTED_MUTATION=1 is required')
    expect(curlInvoked).toBe(false)
    expect(handles.indexOf('hosted_confirmation_require'))
      .toBeLessThan(handles.indexOf('hosted_access_token_require'))
  })

  it('contains no default target or credential-location fallback', () => {
    const hosted = [
      handles,
      read('recipes/hosted/read-only/installed-precondition-live.sh'),
      read('recipes/hosted/rollback/knowledge-graph-poc.sh'),
      read('recipes/hosted/rollback/privacy-backstop-proof.sh'),
      guard,
    ].join('\n')
    expect(hosted).not.toMatch(/\/Users\/|\/home\/|\bssh\b/)
    expect(hosted).not.toMatch(/PROJECT_REF="?[a-z0-9]{20}"?/)
  })
})
