import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const dockerBoundary = resolve(process.cwd(), 'recipes/lib/docker-proof.sh')
const dockerRecipes = [
  'recipes/authority-projection-concurrency.sh',
  'recipes/knowledge-graph-cutover-concurrency.sh',
  'recipes/knowledge-graph-local-proof.sh',
  'recipes/installed-schema-authority.sh',
  'recipes/private-reply-promotion-concurrency.sh',
  'recipes/private-reply-promotion-integrity.sh',
  'recipes/room-invite-authority-concurrency.sh',
  'recipes/session-authority-concurrency.sh',
]

const runDockerBoundary = (body: string, securityOptions = '[]') => {
  const mockBin = mkdtempSync(join(tmpdir(), 'voyager-docker-proof-contract.'))
  const dockerPath = join(mockBin, 'docker')
  const logPath = join(mockBin, 'docker.log')
  writeFileSync(dockerPath, [
    '#!/bin/sh',
    'if [ "$1" = info ]; then',
    '  printf \'%s\\n\' "$MOCK_SECURITY_OPTIONS"',
    '  exit 0',
    'fi',
    'printf \'docker:%s\\n\' "$@" >> "$MOCK_DOCKER_LOG"',
    '',
  ].join('\n'))
  chmodSync(dockerPath, 0o700)
  const result = spawnSync('/bin/bash', [
    '-c',
    ['set -euo pipefail', 'source "$1"', body].join('\n'),
    'docker-proof-contract',
    dockerBoundary,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: mockBin,
      MOCK_DOCKER_LOG: logPath,
      MOCK_SECURITY_OPTIONS: securityOptions,
    },
  })
  const calls = existsSync(logPath) ? readFileSync(logPath, 'utf8') : ''
  rmSync(mockBin, { recursive: true, force: true })
  return { calls, result }
}

describe('disposable Docker proof boundary', () => {
  it('constructs no-SELinux Docker arguments under /bin/bash with nounset', () => {
    const { calls, result } = runDockerBoundary([
      'docker_proof_detect_security',
      'docker_proof_run --detach --name proof postgres:15',
    ].join('\n'), '["name=seccomp"]')

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(calls).toBe([
      'docker:run',
      'docker:--detach',
      'docker:--name',
      'docker:proof',
      'docker:postgres:15',
      '',
    ].join('\n'))
  })

  it('constructs SELinux Docker arguments without mutating the worktree label', () => {
    const { calls, result } = runDockerBoundary([
      'docker_proof_detect_security',
      'docker_proof_run --detach --name proof postgres:15',
    ].join('\n'), '["name=selinux","name=seccomp"]')

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(calls).toBe([
      'docker:run',
      'docker:--security-opt',
      'docker:label=disable',
      'docker:--detach',
      'docker:--name',
      'docker:proof',
      'docker:postgres:15',
      '',
    ].join('\n'))

    const boundary = read('recipes/lib/docker-proof.sh')
    expect(boundary).toContain("== *selinux*")
    expect(boundary).toContain('--security-opt label=disable')
    expect(boundary).not.toContain('DOCKER_PROOF_SECURITY_ARGS')
    for (const path of dockerRecipes) {
      const recipe = read(path)
      expect(recipe).toContain('docker_proof_detect_security')
      expect(recipe).toContain('docker_proof_run --detach')
      expect(recipe).toContain('pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee')
      expect(recipe).toContain('docker_proof_install_pre054')
      expect(recipe).not.toContain('DOCKER_PROOF_SECURITY_ARGS')
      expect(recipe).not.toContain(':Z')
      expect(recipe).not.toContain(':z')
    }
  })

  it('rejects temporary entrypoint states until final postgres serves the exact database', () => {
    const { calls, result } = runDockerBoundary([
      'docker() {',
      '  if [ "$1" = exec ] && [ "$3" = sh ]; then',
      '    if [ ! -e "$MOCK_DOCKER_LOG.pid1" ]; then',
      '      : > "$MOCK_DOCKER_LOG.pid1"; pid_one=docker-entrypoi',
      '    elif [ ! -e "$MOCK_DOCKER_LOG.pid1-again" ]; then',
      '      : > "$MOCK_DOCKER_LOG.pid1-again"; pid_one=docker-entrypoi',
      '    else pid_one=postgres; fi',
      '    printf \'pid1:%s\\n\' "$pid_one" >> "$MOCK_DOCKER_LOG"',
      '    printf \'%s\\n\' "$pid_one"; return',
      '  fi',
      '  printf \'docker:%s\\n\' "$@" >> "$MOCK_DOCKER_LOG"; printf \'1\\n\'',
      '}',
      'sleep() { :; }',
      'docker_proof_wait_ready proof exactdb',
    ].join('\n'))

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(calls).toBe([
      'pid1:docker-entrypoi', 'pid1:docker-entrypoi', 'pid1:postgres',
      'docker:exec', 'docker:proof', 'docker:psql', 'docker:-X', 'docker:-Atq', 'docker:-v',
      'docker:ON_ERROR_STOP=1', 'docker:-U', 'docker:postgres', 'docker:-d',
      'docker:exactdb', 'docker:-c', 'docker:SELECT 1', '',
    ].join('\n'))
  })

  it('fails closed after the bounded wait when final postgres never owns PID 1', () => {
    const { calls, result } = runDockerBoundary([
      'docker() {',
      '  printf \'pid1:docker-entrypoi\\n\' >> "$MOCK_DOCKER_LOG"',
      '  printf \'docker-entrypoi\\n\'',
      '}',
      'sleep() { :; }',
      'docker_proof_wait_ready proof exactdb',
    ].join('\n'))

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(calls.match(/^pid1:/gm)).toHaveLength(100)
    expect(calls).not.toContain('docker:psql')
  })

  it('routes every Docker recipe through the one bounded readiness boundary', () => {
    for (const path of dockerRecipes) {
      const recipe = read(path)
      expect(recipe.match(/docker_proof_wait_ready/g)).toHaveLength(1)
      expect(recipe).toContain('docker_proof_wait_ready "$CONTAINER_NAME" "$DATABASE"')
      expect(recipe).toContain("|| fail 'PostgreSQL readiness timeout'")
      expect(recipe).not.toContain('ready=false')
      expect(recipe).not.toContain('startup_probe')
      expect(recipe).not.toContain("-c 'SELECT 1'")
    }
  })

  it('removes the container before reaping children and never signals stale PIDs', () => {
    const { calls, result } = runDockerBoundary([
      'wait() { printf \'wait:%s\\n\' "$1" >> "$MOCK_DOCKER_LOG"; }',
      'kill() { printf \'kill:%s\\n\' "$*" >> "$MOCK_DOCKER_LOG"; }',
      'docker_proof_cleanup proof-container "111 222"',
    ].join('\n'))

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(calls).toBe([
      'docker:rm',
      'docker:-f',
      'docker:proof-container',
      'wait:111',
      'wait:222',
      '',
    ].join('\n'))

    const boundary = read('recipes/lib/docker-proof.sh')
    expect(boundary.indexOf('docker rm -f "$container_name"'))
      .toBeLessThan(boundary.indexOf('wait "$child_pid"'))
    expect(boundary).not.toMatch(/\bkill\b/)
    for (const path of dockerRecipes) {
      const recipe = read(path)
      expect(recipe).toContain('docker_proof_cleanup "$CONTAINER_NAME"')
      expect(recipe).not.toMatch(/for pid in \$PIDS; do kill/)
    }
  })

  it('keeps the installed-authority recipes executable for direct invocation', () => {
    const installedMode = statSync(
      resolve(process.cwd(), 'recipes/installed-schema-authority.sh'),
    ).mode & 0o777
    const peerMode = statSync(
      resolve(process.cwd(), 'recipes/knowledge-graph-local-proof.sh'),
    ).mode & 0o777
    const liveMode = statSync(
      resolve(process.cwd(), 'recipes/installed-precondition-live.sh'),
    ).mode & 0o777

    expect(installedMode).toBe(peerMode)
    expect(installedMode & 0o111).toBe(0o111)
    expect(liveMode & 0o111).toBe(0o111)
  })

  it('bounds hosted token fallback and Management API calls', () => {
    const hosted = read('recipes/knowledge-graph-poc.sh')
    expect(hosted).toContain('-o ConnectTimeout=15')
    expect(hosted).toContain('-o ConnectionAttempts=1')
    expect(hosted).toContain('--connect-timeout 15 --max-time 180')
  })
})
