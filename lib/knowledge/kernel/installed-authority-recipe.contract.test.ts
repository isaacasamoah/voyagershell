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

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const recipe = read('recipes/installed-schema-authority.sh')
const dockerHelper = read('recipes/lib/docker-proof.sh')
const composer = read('recipes/lib/installed-precondition.sh')
const checksumHelper = resolve(process.cwd(), 'recipes/lib/sha256.sh')
const precondition = [
  'recipes/sql/installed-pre-054-precondition/expectations.sql',
  'recipes/sql/installed-pre-054-precondition/catalog.sql',
  'recipes/sql/installed-pre-054-precondition/verdict.sql',
].map(read).join('')

const runChecksumSelection = (command: 'sha256sum' | 'shasum' | null) => {
  const mockBin = mkdtempSync(join(tmpdir(), 'voyager-sha256-contract.'))
  const argsPath = join(mockBin, 'args')
  if (command) {
    const commandPath = join(mockBin, command)
    writeFileSync(commandPath, [
      '#!/bin/sh',
      'printf \'%s\\n\' "$*" > "$MOCK_ARGS"',
      'printf \'abc123  fixture\\n\'',
      '',
    ].join('\n'))
    chmodSync(commandPath, 0o700)
  }
  const result = spawnSync('/bin/bash', ['-c', [
    'source "$1"',
    'select_sha256_command || exit $?',
    'printf \'%s\\n\' "${SHA256_COMMAND[*]}"',
    'sha256_digest fixture',
  ].join('; '), 'selector', checksumHelper], {
    encoding: 'utf8',
    env: { ...process.env, PATH: mockBin, MOCK_ARGS: argsPath },
  })
  const args = existsSync(argsPath) ? readFileSync(argsPath, 'utf8').trim() : ''
  rmSync(mockBin, { recursive: true, force: true })
  return { result, args }
}

describe('installed-state authority recipe', () => {
  it('constructs one baseline, proves its precondition, and applies only 054-059', () => {
    const baselineKnowledge = read('recipes/sql/installed-pre-054/knowledge.sql')
    const baselineFunctions = read('recipes/sql/installed-pre-054/functions.sql')
    const baselineCore = read('recipes/sql/installed-pre-054/core.sql')
    expect(recipe).toContain('pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee')
    expect(recipe).toContain('docker_proof_install_pre054 "$CONTAINER_NAME" "$DATABASE"')
    expect(recipe).toContain('printf \'%s\\n\' "$INSTALLED_PRECONDITION_MARKER"')
    expect(recipe).not.toContain('DOCKER_PROOF_PRE054_MARKER')
    expect(recipe).not.toContain('| tail -n 1')
    expect(dockerHelper).toContain(
      'DOCKER_PROOF_PRE054_BASELINE=recipes/sql/installed-pre-054-baseline.sql',
    )
    expect(dockerHelper).toContain('source "$DOCKER_PROOF_LIB_DIR/installed-precondition.sh"')
    expect(dockerHelper).toContain(
      'installed_precondition_compose "$DOCKER_PROOF_REPO_ROOT" |',
    )
    expect(dockerHelper).toContain(
      'ALTER TABLE public.spaces RENAME TO spaces_precondition_missing',
    )
    expect(dockerHelper).toContain('[ "$marker" = missing_table:spaces ]')
    expect(dockerHelper).toContain(
      'ALTER TABLE public.voyages DROP CONSTRAINT voyages_invite_code_key',
    )
    expect(dockerHelper).toContain('[ "$marker" = voyage_invite_identity ]')
    expect(dockerHelper).toContain(
      'FOR EACH ROW EXECUTE FUNCTION public.update_search_vector()',
    )
    expect(dockerHelper).toContain('[ "$marker" = event_projection_trigger ]')
    expect(dockerHelper).toContain(
      'FOREIGN KEY (shared_event_id) REFERENCES public.profiles(id)',
    )
    expect(dockerHelper).toContain('[ "$marker" = promotion_foreign_keys ]')
    expect(dockerHelper).toContain('precondition_unexpected_promotion_fkey')
    expect(dockerHelper).toContain('[ "$marker" = default:space_members.state ]')
    expect(dockerHelper).toContain(
      "CHECK (state IN ('invited', 'active', 'left', 'blocked'))",
    )
    expect(dockerHelper).toContain('[ "$marker" = space_members_state_check ]')
    for (const fragment of [
      'expectations.sql', 'catalog.sql', 'verdict.sql',
    ]) expect(composer).toContain(fragment)
    expect(recipe.match(/supabase\/migrations\/05[4-9]_[a-z_]+\.sql/g)).toEqual([
      'supabase/migrations/054_active_membership_authority.sql',
      'supabase/migrations/055_active_knowledge_retrieval.sql',
      'supabase/migrations/056_room_invite_authority.sql',
      'supabase/migrations/057_room_invite_transition.sql',
      'supabase/migrations/058_private_reply_promotion_authority.sql',
      'supabase/migrations/059_session_authority_cleanup.sql',
    ])
    expect(recipe).toContain('for migration in "${MIGRATIONS[@]}"')
    expect(recipe).toContain('--single-transaction')
    expect(recipe).not.toContain('INSTALL_ORDER')
    expect(recipe).not.toContain('MIGRATION_044')
    expect(recipe).not.toContain('installed-schema-bootstrap.sql')
    expect(baselineCore).toContain(
      'invite_code text UNIQUE DEFAULT md5(random()::text)',
    )
    expect(baselineKnowledge).toContain('attention_score real DEFAULT 0.5')
    for (const cleanupIdentity of [
      'vector, uuid, text, boolean, text[], double precision, double precision, integer',
      'text, uuid, text, text, double precision, integer',
      'uuid, text, uuid[], text, text, boolean, timestamptz, timestamptz,\n  double precision, integer',
      'CREATE FUNCTION public.resume_session(uuid, uuid)',
      'CREATE FUNCTION public.search_memories(vector, uuid, double precision, integer)',
      'CREATE FUNCTION public.supersede_memory(uuid, text, vector, double precision)',
    ]) expect(baselineFunctions).toContain(cleanupIdentity)
    expect(precondition).toContain('allowed_cleanup_functions')
    expect(precondition).toContain("'unexpected_function_identity:'")
    expect(precondition).toContain(
      "('knowledge_current', 'attention_score', '0.5')",
    )
    expect(baselineCore).toContain('GRANT SELECT ON public.spaces TO service_role')
    expect(precondition).toContain(
      "('service_role', 'spaces', 'SELECT')",
    )
    expect(precondition).toContain('expected_table_privileges')
    expect(precondition).toContain(
      "('search_memories', 'vector, uuid, double precision, integer')",
    )
    expect(precondition).toContain(
      "('supersede_memory', 'uuid, text, vector, double precision')",
    )
    expect(precondition).toContain('expected_triggers')
    expect(precondition).toContain('actual_triggers')
    expect(precondition).toContain('expected_foreign_keys')
    expect(precondition).toContain('actual_foreign_keys')
    expect(precondition).toContain('expected_checks')
    expect(precondition).toContain('actual_checks')
  })

  it('mechanically seals the 001-053 source bytes without calling them a replay', () => {
    expect(recipe).toContain('cbbb78f6fb40ed43fe372d49d7eb26eda1434620')
    expect(recipe).toContain('ls-tree -r --name-only "$BASE_REVISION"')
    expect(recipe).toContain('expected-001-053.txt')
    expect(recipe).toContain('current-001-053.txt')
    expect(recipe).toContain('git -C "$REPO_ROOT" show "$BASE_REVISION:$relative"')
    expect(recipe).toContain('sha256_digest "$REPO_ROOT/$relative"')
    expect(recipe).toContain('MIGRATION_SOURCE_001_053_SEAL_GREEN')
    expect(recipe).not.toMatch(/exact 001-056|replays? every|installed history/i)
  })

  it('selects both portable checksum shapes once and fails closed without either', () => {
    const linux = runChecksumSelection('sha256sum')
    expect(linux.result.status).toBe(0)
    expect(linux.result.stdout).toBe('sha256sum\nabc123\n')
    expect(linux.args).toBe('fixture')

    const mac = runChecksumSelection('shasum')
    expect(mac.result.status).toBe(0)
    expect(mac.result.stdout).toBe('shasum -a 256\nabc123\n')
    expect(mac.args).toBe('-a 256 fixture')

    const missing = runChecksumSelection(null)
    expect(missing.result.status).not.toBe(0)
    expect(missing.result.stderr).toContain('neither sha256sum nor shasum is available')
  })

  it('derives and enforces the post-059 catalogue/type/ACL boundary', () => {
    const postcondition = read('recipes/sql/installed-post-059-contract.sql')
    expect(recipe).toContain('installed-post-059-contract.sql')
    expect(recipe).toContain('installed-authority-assertions.sql')
    expect(recipe).toContain('installed-catalogue-assertions.sql')
    expect(recipe).toContain('installed-membership-revocation-assertions.sql')
    expect(recipe).toContain('INSTALLED_POST_059_CONTRACT_GREEN')
    expect(recipe).toContain('INSTALLED_SCHEMA_AUTHORITY_GREEN')
    for (const dimension of [
      'format_type', 'oidvectortypes', 'prosecdef', 'aclexplode',
      'has_function_privilege', 'attgenerated', 'function_overload',
      'dead_function', 'session_cleanup_residue',
    ]) expect(postcondition).toContain(dimension)
    expect(read('supabase/migrations/054_active_membership_authority.sql')).toContain(
      'public.canonical_space_member_id(space_id, user_id)) STORED NOT NULL',
    )
    const assertions = read('recipes/sql/installed-authority-assertions.sql')
    const catalogueAssertions = read('recipes/sql/installed-catalogue-assertions.sql')
    const membershipAssertions = read(
      'recipes/sql/installed-membership-revocation-assertions.sql',
    )
    expect(assertions).toContain('installed_member_preference_leaked')
    expect(assertions).toContain('installed_owner_preference_denied')
    expect(assertions).toContain('installed_resume_cross_context_mutation')
    expect(assertions.match(/^SET ROLE service_role;$/gm)).toHaveLength(2)
    expect(assertions.match(/^RESET ROLE;$/gm)).toHaveLength(2)
    const firstServiceRole = assertions.indexOf('SET ROLE service_role;')
    const ownerReset = assertions.indexOf('RESET ROLE;', firstServiceRole)
    const secondServiceRole = assertions.indexOf('SET ROLE service_role;', ownerReset)
    const finalReset = assertions.indexOf('RESET ROLE;', secondServiceRole)
    const resumePhase = assertions.slice(firstServiceRole, ownerReset)
    const ownerInspectionPhase = assertions.slice(ownerReset, secondServiceRole)
    const authorityPhase = assertions.slice(secondServiceRole, finalReset)
    expect(resumePhase.match(/public\.resume_session\(/g)).toHaveLength(2)
    expect(resumePhase).not.toContain('FROM public.sessions')
    expect(ownerInspectionPhase.match(/FROM public\.sessions/g)).toHaveLength(4)
    expect(ownerInspectionPhase.match(/IS DISTINCT FROM/g)).toHaveLength(4)
    expect(ownerInspectionPhase).not.toMatch(/\)\s*<>/)
    expect(ownerInspectionPhase).not.toContain('public.resume_session')
    expect(authorityPhase).toContain('public.get_knowledge_by_ids(')
    expect(authorityPhase).toContain('public.get_voyage_messages(')
    expect(authorityPhase).toContain('public.graph_traverse(')
    expect(authorityPhase).not.toContain('FROM public.sessions')
    expect(assertions.slice(finalReset).trim()).toBe('RESET ROLE;')
    expect(assertions).not.toMatch(/\bGRANT\b/i)
    expect(postcondition).toContain("'session_table_privilege:' || privilege_name")
    expect(postcondition).toContain(
      "'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'",
    )
    expect(postcondition).toContain(
      "'service_role', 'public.sessions', privilege_name",
    )
    expect(postcondition).toContain('has_any_column_privilege')
    expect(postcondition).toContain("'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'")
    expect(catalogueAssertions).toContain('installed_callable_overload_residue')
    expect(catalogueAssertions).toContain('installed_anon_resume_accepted')
    expect(membershipAssertions).toContain('installed_left_exact_id_accepted')
    expect(membershipAssertions).toContain('INSTALLED_SCHEMA_AUTHORITY_GREEN')
  })

  it('keeps the deterministic proof in CI after the exact fixed image pull', () => {
    const workflow = read('.github/workflows/ci.yml')
    const buildGate = workflow.slice(workflow.indexOf('  build:'))
    const pull = buildGate.indexOf('docker pull pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee')
    const proof = buildGate.indexOf('./recipes/installed-schema-authority.sh')
    expect(buildGate).toContain('name: Build Gate')
    expect(buildGate).toMatch(/actions\/checkout@v4[\s\S]*fetch-depth: 0/)
    expect(pull).toBeGreaterThan(-1)
    expect(proof).toBeGreaterThan(pull)
    expect(workflow).not.toContain('installed-history')
    expect(workflow).not.toContain('installed-precondition-live.sh')
  })
})
