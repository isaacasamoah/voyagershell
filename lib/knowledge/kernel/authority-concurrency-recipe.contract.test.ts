import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readRepoFile = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const recipe = readRepoFile('recipes/authority-projection-concurrency.sh')
const assertions = readRepoFile('recipes/sql/knowledge-graph/authority-projection-assertions.sql')
const membershipMigration = readRepoFile('supabase/migrations/054_active_membership_authority.sql')
const pre054Core = readRepoFile('recipes/sql/installed-pre-054/core.sql')

type MembershipScope = 'voyage' | 'space'; type MembershipState = 'active' | 'left'
type StateWrite = { scope: MembershipScope; state: MembershipState; member: string }; type RevisionLedger = Record<MembershipScope, { state: MembershipState; revision: number }>

const cato = { user: '10000000-0000-4000-8000-000000000003', voyageMember: '40000000-0000-4000-8000-000000000003', voyage: '20000000-0000-4000-8000-000000000001', space: '30000000-0000-4000-8000-000000000001' }
const shellSeparator = String.raw`(?:[ \t]+|[ \t]*\\\r?\n[ \t]*)`

const functionSource = (name: string): string => {
  const match = recipe.match(new RegExp(`${name}\\(\\) \\{[\\s\\S]*?\\n\\}`))
  if (!match) throw new Error(`missing ${name} recipe function`)
  return match[0]
}
const functionBody = (name: string): string => functionSource(name).replace(/^[^{]+\{\n/, '').replace(/\n\}$/, '')

const seededSpaceFor = (userId: string): string => {
  const seed = recipe.match(/INSERT INTO public\.space_members\(space_id, user_id\) VALUES([^;]+);/)?.[1] ?? ''
  const spaces = Array.from(seed.matchAll(/\('([^']+)', '([^']+)'\)/g)).filter((match) => match[2] === userId).map((match) => match[1])
  if (spaces.length !== 1) throw new Error(`expected one seeded space for ${userId}`)
  return spaces[0]
}

const membershipWrites = (sql: string): StateWrite[] => {
  const statements = Array.from(sql.replace(/\s+/g, ' ').matchAll(
    /UPDATE (?:public\.)?(?:voyage_members|space_members) SET state\s*=\s*'(?:active|left)' WHERE [^;"]+|INSERT INTO public\.space_members\(space_id, user_id, state\) VALUES \([^)]*\) ON CONFLICT \(space_id, user_id\) DO UPDATE SET state = EXCLUDED\.state/g,
  ), (match) => match[0])
  return statements.map((statement) => {
    const voyage = statement.match(/UPDATE (?:public\.)?voyage_members SET state\s*=\s*'(active|left)' WHERE id\s*=\s*'([^']+)'/)
    if (voyage) {
      if (voyage[2] !== cato.voyageMember) throw new Error('voyage write is not Cato')
      return { scope: 'voyage', state: voyage[1] as MembershipState, member: voyage[2] }
    }
    const spaceUpdate = statement.match(/UPDATE (?:public\.)?space_members SET state\s*=\s*'(active|left)' WHERE ([^"]+)/)
    const spaceInsert = statement.match(/INSERT INTO public\.space_members\(space_id, user_id, state\) VALUES \('([^']+)', '([^']+)', '(active|left)'\) ON CONFLICT/)
    const where = spaceUpdate?.[2] ?? ''
    const userId = spaceInsert?.[2] ?? where.match(/user_id\s*=\s*'([^']+)'/)?.[1]
    const spaceId = spaceInsert?.[1] ?? where.match(/space_id\s*=\s*'([^']+)'/)?.[1]
      ?? (userId ? seededSpaceFor(userId) : undefined)
    const state = spaceInsert?.[3] ?? spaceUpdate?.[1]
    if (spaceId !== cato.space || userId !== cato.user || !state) throw new Error('space write is not Cato')
    return { scope: 'space', state: state as MembershipState, member: `${spaceId}:${userId}` }
  })
}

const parentChildCall = (source: string, phase: 'child-first' | 'parent-first') => {
  const pattern = `run_parent_child_overlap ${phase}${shellSeparator}"([^"]+)"${shellSeparator}"([^"]+)"[ \\t]+(success|reject)`
  const match = source.match(new RegExp(pattern))
  if (!match) throw new Error(`missing ${phase} parent-child call`)
  const holder = membershipWrites(match[1])
  const contender = membershipWrites(match[2])
  if (holder.length !== 1 || contender.length !== 1) throw new Error(`ambiguous ${phase} state writes`)
  return { holder: holder[0], contender: contender[0], outcome: match[3] }
}

const shellRoleTrace = () => {
  const functions = `${recipe.match(/^fail\(\) \{[^\n]+\}$/m)?.[0] ?? 'missing_recipe_fail'}\n${functionSource('wait_for_query').replace(/^wait_for_query/, 'recipe_wait_for_query')}\n${functionSource('run_parent_child_overlap')}\n${functionSource('run_overlap')}\n${functionSource('run_label_overlap')}`
  const script = `
set -euo pipefail
TRACE_DIR="$(mktemp -d "\${TMPDIR:-/tmp}/voyager-role-trace.XXXXXX")"; trap 'rm -rf -- "$TRACE_DIR"' EXIT
TEMP_DIR="$TRACE_DIR"; CONTAINER_NAME=trace; DATABASE=trace; PIDS=''; PROBE_COUNT=0; OBSERVER_MODE=none; EXPECTED_OBSERVER_QUERY=''; wait_for_query() { PROBE_COUNT=$((PROBE_COUNT + 1)); local deadline=$((SECONDS + 2)) count path; while :; do count=0; for path in "$TRACE_DIR"/*.argv; do [ -e "$path" ] && count=$((count + 1)); done; if [ "$count" -ge "$PROBE_COUNT" ]; then printf '%s\\n' "$1" > "$TRACE_DIR/probe-$PROBE_COUNT.sql"; printf '%s\\n' "$2" > "$TRACE_DIR/probe-$PROBE_COUNT.label"; printf 'probe:%s\\n' "$2" >> "$TRACE_DIR/events"; return 0; fi; [ "$SECONDS" -lt "$deadline" ] || return 1; done; }; wait() { printf 'wait\\n' >> "$TRACE_DIR/events"; builtin wait "$@"; }; sleep() { [ "$#" -eq 1 ] && [ "$1" = 0.1 ] || return 1; local file="$TRACE_DIR/$OBSERVER_MODE.sleep" count=0; [ ! -f "$file" ] || read -r count < "$file"; printf '%s\\n' "$((count + 1))" > "$file"; }
docker() {
  local app='' argument query='' next=false count=0 counter="$TRACE_DIR/$OBSERVER_MODE.observer"; for argument in "$@"; do if [ "$next" = true ]; then query="$argument"; next=false; continue; fi; case "$argument" in PGAPPNAME=*) app="\${argument#PGAPPNAME=}";; -c) next=true;; esac; done; if [ -n "$query" ]; then printf '%s\\0' "$@" > "$TRACE_DIR/observer.argv"; printf '%s\\0' exec trace psql -X -Atq -U postgres -d trace -c "$EXPECTED_OBSERVER_QUERY" > "$TRACE_DIR/expected-observer.argv"; cmp -s "$TRACE_DIR/expected-observer.argv" "$TRACE_DIR/observer.argv" || return 1; [ ! -f "$counter" ] || read -r count < "$counter"; count=$((count + 1)); printf '%s\\n' "$count" > "$counter"; case "$OBSERVER_MODE" in retry) [ "$count" -eq 1 ] && printf '0\\n' || printf '1\\n';; failure) return 1;; timeout) printf '0\\n';; *) return 1;; esac; return; fi; printf 'docker:%s\\n' "$app" >> "$TRACE_DIR/events"; printf '%s\\0' "$@" > "$TRACE_DIR/\${app:-missing}.argv"
  cat > "$TRACE_DIR/$app.sql"; case "$app" in parent-child-trace-reject-contender) printf 'space_member_parent_membership_required\\n' >&2; return 1;; parent-child-matrix-success-failure-contender|parent-child-matrix-reject-wrong-contender) printf 'unexpected_contender_error\\n' >&2; return 1;; parent-child-matrix-holder-failure-holder) printf 'holder_error\\n' >&2; return 1;; esac
}
${functions}
run_parent_child_overlap trace-success "SELECT 'HOLDER_SUCCESS';" "SELECT 'CONTENDER_SUCCESS';" success; run_parent_child_overlap trace-reject "SELECT 'HOLDER_REJECT';" "SELECT 'CONTENDER_REJECT';" reject; run_overlap trace trace_members "member = 'RUN_HOLDER'" "member = 'RUN_CONTENDER'"; run_label_overlap trace "SELECT 'LABEL_HOLDER';" "SELECT 'LABEL_CONTENDER';"
normalize() { awk 'NF { gsub(/[[:space:]]+/, " "); sub(/^ /, ""); sub(/ $/, ""); printf "%s%s", separator, $0; separator=" " } END { print "" }' "$1"; }
for proof in "parent-child-trace-success-holder|BEGIN; SET LOCAL lock_timeout = '10s'; SET LOCAL statement_timeout = '15s'; SELECT 'HOLDER_SUCCESS'; SELECT pg_sleep(4); COMMIT;" "parent-child-trace-success-contender|BEGIN; SET LOCAL lock_timeout = '10s'; SET LOCAL statement_timeout = '15s'; SELECT 'CONTENDER_SUCCESS'; COMMIT;" "parent-child-trace-reject-holder|BEGIN; SET LOCAL lock_timeout = '10s'; SET LOCAL statement_timeout = '15s'; SELECT 'HOLDER_REJECT'; SELECT pg_sleep(4); COMMIT;" "parent-child-trace-reject-contender|BEGIN; SET LOCAL lock_timeout = '10s'; SET LOCAL statement_timeout = '15s'; SELECT 'CONTENDER_REJECT'; COMMIT;" "authority-trace-holder|BEGIN; SET LOCAL lock_timeout = '10s'; SET LOCAL statement_timeout = '15s'; UPDATE public.trace_members SET state = 'left' WHERE member = 'RUN_HOLDER'; SELECT pg_sleep(4); COMMIT;" "authority-trace-contender|BEGIN; SET LOCAL lock_timeout = '10s'; SET LOCAL statement_timeout = '15s'; UPDATE public.trace_members SET state = 'left' WHERE member = 'RUN_CONTENDER'; COMMIT;" "label-trace-holder|BEGIN; SELECT 'LABEL_HOLDER';; SELECT pg_sleep(4); COMMIT;" "label-trace-contender|BEGIN; SELECT 'LABEL_CONTENDER';; SELECT pg_sleep(2); COMMIT;"; do [ "$(normalize "$TRACE_DIR/\${proof%%|*}.sql")" = "\${proof#*|}" ]; printf '%s\\0' exec -i -e "PGAPPNAME=\${proof%%|*}" trace psql -X -v ON_ERROR_STOP=1 -U postgres -d trace > "$TRACE_DIR/expected.argv"; cmp -s "$TRACE_DIR/expected.argv" "$TRACE_DIR/\${proof%%|*}.argv"; done; for probe in "1|trace-success parent-child holder|SELECT count(*) FROM pg_stat_activity WHERE application_name = 'parent-child-trace-success-holder' AND wait_event = 'PgSleep'" "2|trace-success parent-child block|SELECT count(*) FROM pg_stat_activity c JOIN LATERAL unnest(pg_blocking_pids(c.pid)) blocker(pid) ON true JOIN pg_stat_activity h ON h.pid = blocker.pid AND h.application_name = 'parent-child-trace-success-holder' WHERE c.application_name = 'parent-child-trace-success-contender' AND c.wait_event_type = 'Lock'" "3|trace-reject parent-child holder|SELECT count(*) FROM pg_stat_activity WHERE application_name = 'parent-child-trace-reject-holder' AND wait_event = 'PgSleep'" "4|trace-reject parent-child block|SELECT count(*) FROM pg_stat_activity c JOIN LATERAL unnest(pg_blocking_pids(c.pid)) blocker(pid) ON true JOIN pg_stat_activity h ON h.pid = blocker.pid AND h.application_name = 'parent-child-trace-reject-holder' WHERE c.application_name = 'parent-child-trace-reject-contender' AND c.wait_event_type = 'Lock'" "5|trace holder lock|SELECT count(*) FROM pg_stat_activity a WHERE a.application_name = 'authority-trace-holder' AND a.wait_event = 'PgSleep' AND EXISTS (SELECT 1 FROM pg_locks l WHERE l.pid = a.pid AND l.locktype = 'advisory' AND l.granted)" "6|trace contender block|SELECT count(*) FROM pg_stat_activity c JOIN LATERAL unnest(pg_blocking_pids(c.pid)) blocker(pid) ON true JOIN pg_stat_activity h ON h.pid = blocker.pid AND h.application_name = 'authority-trace-holder' WHERE c.application_name = 'authority-trace-contender' AND c.wait_event_type = 'Lock' AND c.wait_event = 'advisory'" "7|trace label holder|SELECT count(*) FROM pg_stat_activity WHERE application_name='label-trace-holder' AND wait_event='PgSleep'" "8|trace real overlap|SELECT (count(*)=2)::int FROM pg_stat_activity WHERE application_name IN ('label-trace-holder','label-trace-contender')"; do IFS='|' read -r number label expected_sql <<< "$probe"; [ "$(cat "$TRACE_DIR/probe-$number.label")" = "$label" ]; [ "$(normalize "$TRACE_DIR/probe-$number.sql")" = "$expected_sql" ]; done; printf '%s\\n' docker:parent-child-trace-success-holder "probe:trace-success parent-child holder" docker:parent-child-trace-success-contender "probe:trace-success parent-child block" wait wait docker:parent-child-trace-reject-holder "probe:trace-reject parent-child holder" docker:parent-child-trace-reject-contender "probe:trace-reject parent-child block" wait wait docker:authority-trace-holder "probe:trace holder lock" docker:authority-trace-contender "probe:trace contender block" wait wait docker:label-trace-holder "probe:trace label holder" docker:label-trace-contender "probe:trace real overlap" wait wait > "$TRACE_DIR/expected.events"; cmp -s "$TRACE_DIR/expected.events" "$TRACE_DIR/events"
expect_failure() { local name="$1" expected="$2"; shift 2; if ( "$@" ) >"$TRACE_DIR/$name.case" 2>&1; then return 1; fi; grep -Fqx "$expected" "$TRACE_DIR/$name.case"; }; OBSERVER_MODE=retry; EXPECTED_OBSERVER_QUERY="SELECT 'RETRY';"; recipe_wait_for_query "$EXPECTED_OBSERVER_QUERY" retry-proof; [ "$(cat "$TRACE_DIR/retry.observer")" = 2 ]; [ "$(cat "$TRACE_DIR/retry.sleep")" = 1 ]; OBSERVER_MODE=failure; EXPECTED_OBSERVER_QUERY="SELECT 'FAILURE';"; expect_failure observer-failure "authority-concurrency: failure-proof observer failed" recipe_wait_for_query "$EXPECTED_OBSERVER_QUERY" failure-proof; [ "$(cat "$TRACE_DIR/failure.observer")" = 1 ]; [ ! -e "$TRACE_DIR/failure.sleep" ]; OBSERVER_MODE=timeout; EXPECTED_OBSERVER_QUERY="SELECT 'TIMEOUT';"; expect_failure observer-timeout "authority-concurrency: timeout-proof timeout" recipe_wait_for_query "$EXPECTED_OBSERVER_QUERY" timeout-proof; [ "$(cat "$TRACE_DIR/timeout.observer")" = 50 ]; [ "$(cat "$TRACE_DIR/timeout.sleep")" = 50 ]; OBSERVER_MODE=none
expect_failure success-failure "authority-concurrency: matrix-success-failure parent-child contender failed" run_parent_child_overlap matrix-success-failure "SELECT 'HOLDER';" "SELECT 'CONTENDER';" success; expect_failure reject-success "authority-concurrency: matrix-reject-success parent-child activation was accepted" run_parent_child_overlap matrix-reject-success "SELECT 'HOLDER';" "SELECT 'CONTENDER';" reject; expect_failure reject-wrong "authority-concurrency: matrix-reject-wrong parent-child rejection was not exact" run_parent_child_overlap matrix-reject-wrong "SELECT 'HOLDER';" "SELECT 'CONTENDER';" reject; expect_failure holder-failure "authority-concurrency: matrix-holder-failure parent-child holder failed" run_parent_child_overlap matrix-holder-failure "SELECT 'HOLDER';" "SELECT 'CONTENDER';" success
printf 'SHELL_ROLE_TRACE_GREEN\\n'`
  return spawnSync('/bin/bash', ['-c', script], { encoding: 'utf8' })
}

const assertedActiveRevision = (table: 'voyage_members' | 'space_members'): number => {
  const activeUser = assertions.match(/v_active uuid\[\] := ARRAY\['([^']+)'::uuid\];/)?.[1]
  if (activeUser !== cato.user) throw new Error('final assertions are not scoped to Cato')
  const matches = Array.from(assertions.matchAll(new RegExp(
    `FROM public\\.${table} WHERE user_id = v_active\\[1\\]\\s+AND state = 'active' AND revision = (\\d+)\\)`,
    'g',
  )))
  if (matches.length !== 1) throw new Error(`expected one exact ${table} final revision assertion`)
  return Number(matches[0][1])
}

const applyWrite = (ledger: RevisionLedger, write: StateWrite): void => {
  const current = ledger[write.scope]
  if (current.state === write.state) return
  const previousState = current.state
  ledger[write.scope] = { state: write.state, revision: current.revision + 1 }
  if (write.scope === 'voyage' && previousState === 'active' && write.state === 'left') {
    applyWrite(ledger, { scope: 'space', state: 'left', member: `${cato.space}:${cato.user}` })
  }
}

describe('authority projection concurrency recipe contract', () => {
  it('uses one isolated local PostgreSQL container and exact projection migrations', () => {
    for (const fragment of [
      'IMAGE=pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee',
      'CONTAINER_NAME="voyager-authority-concurrency-$(date +%s)-$$"',
      'docker_proof_run --detach --rm --pull=never --name "$CONTAINER_NAME" --network none',
    ]) expect(recipe).toContain(fragment)
    for (const fragment of ['docker pull', '--publish', 'POSTGRES_PASSWORD']) expect(recipe).not.toContain(fragment)
    const migrationBlock = recipe.slice(recipe.indexOf('MIGRATIONS=('), recipe.indexOf('\n)\nASSERTIONS='))
    expect(migrationBlock.match(/(?:supabase\/migrations|recipes\/sql\/knowledge-graph)\/\d+_[a-z_]+\.sql/g)).toEqual(
      ['supabase/migrations/054_active_membership_authority.sql', 'supabase/migrations/061_knowledge_graph_schema.sql', 'supabase/migrations/062_knowledge_graph_authorization.sql', 'supabase/migrations/065_knowledge_graph_authority_projection.sql', 'supabase/migrations/066_knowledge_graph_membership_projection.sql', 'supabase/migrations/067_knowledge_graph_projection_activation.sql'],
    )
    expect(recipe).toContain('--single-transaction')
  })

  it('delegates startup readiness to the canonical exact-database boundary', () => {
    for (const fragment of ['docker_proof_wait_ready "$CONTAINER_NAME" "$DATABASE"', "|| fail 'PostgreSQL readiness timeout'"]) expect(recipe).toContain(fragment)
    expect(recipe).not.toMatch(/pg_isready|startup_probe/)
  })

  it('seeds the installed voyage identity with a deterministic slug', () => {
    const voyageInsertColumns = Array.from(
      recipe.matchAll(/INSERT INTO public\.voyages\s*\(([^)]+)\)/g),
      (match) => match[1].split(',').map((column) => column.trim()),
    )
    expect(voyageInsertColumns).toEqual([['id', 'slug', 'name']])
    expect(recipe).toContain("'authority-concurrency-voyage', 'Concurrency Voyage'")
  })

  it('runs real overlapping holder and contender sessions for both membership tables', () => {
    expect(recipe.match(/<<SQL &/g)).toHaveLength(6)
    for (const fragment of ['SELECT pg_sleep(4)', 'pg_blocking_pids(c.pid)', "l.locktype = 'advisory' AND l.granted", "c.wait_event_type = 'Lock' AND c.wait_event = 'advisory'", 'run_overlap voyage voyage_members', 'run_overlap space space_members', "id = '40000000-0000-4000-8000-000000000001'", "id = '40000000-0000-4000-8000-000000000002'", "user_id = '10000000-0000-4000-8000-000000000001'", "user_id = '10000000-0000-4000-8000-000000000002'", "SET LOCAL lock_timeout = '10s'", "SET LOCAL statement_timeout = '15s'"]) expect(recipe).toContain(fragment)
  })

  it('serializes direct child activation with parent leave in both commit orders', () => {
    expect(membershipMigration).toContain('AND parent.state = \'active\' FOR SHARE OF parent')
    for (const fragment of ['run_parent_child_overlap child-first', 'run_parent_child_overlap parent-first', 'ON CONFLICT (space_id, user_id) DO UPDATE SET state = EXCLUDED.state', 'pg_blocking_pids(c.pid)', 'space_member_parent_membership_required', 'active|left|false', 'assert_rejoin_does_not_revive_child child-first', 'assert_rejoin_does_not_revive_child parent-first']) expect(recipe).toContain(fragment)
  })

  it('fails closed and proves exact final audiences, revisions, times, and uniqueness', () => {
    for (const fragment of ['trap cleanup EXIT', 'docker_proof_cleanup "$CONTAINER_NAME" "$PIDS"', "docker_proof_detect_security >/dev/null 2>&1 || fail 'Docker daemon is unavailable'", 'ON_ERROR_STOP=1', 'authority-projection-assertions.sql']) expect(recipe).toContain(fragment)
    for (const fragment of ['FROM public.voyage_members WHERE voyage_id = v_voyage AND state = \'active\'', 'public.is_effective_space_member(space_id, user_id)', 'member_profile_ids = v_voyage_members', 'member_profile_ids = v_space_members', 'edge.authority_revision IS DISTINCT FROM member.revision', 'edge.effective_at IS DISTINCT FROM member.state_changed_at', "canonical_graph_authority_edge_id(\n        'profile'", "canonical_graph_authority_edge_id('space'", 'count(DISTINCT knowledge_audience_id)', 'GROUP BY authority_kind, authority_row_id, kind HAVING count(*) <> 1', 'AUTHORITY_PROJECTION_CONCURRENCY_GREEN']) expect(assertions).toContain(fragment)
  })

  it('binds the final Cato revisions to every effective recipe transition', () => {
    expect(membershipMigration).toMatch(
      /ELSIF NEW\.state IS DISTINCT FROM OLD\.state THEN\s+NEW\.revision := OLD\.revision \+ 1;/,
    )
    expect(membershipMigration).toMatch(
      /WHEN \(OLD\.state = 'active' AND NEW\.state = 'left'\)\s+EXECUTE FUNCTION public\.deactivate_child_space_memberships\(\);/,
    )
    expect(membershipMigration).toMatch(/CREATE FUNCTION public\.deactivate_child_space_memberships\(\)[\s\S]*?UPDATE public\.space_members child SET state = 'left'[\s\S]*?space\.voyage_id = NEW\.voyage_id AND child\.user_id = NEW\.user_id\s+AND child\.state <> 'left';/)
    expect(membershipMigration).toMatch(/ELSE\s+NEW\.revision := OLD\.revision;/)
    const revisions = Array.from(membershipMigration.matchAll(
      /ADD COLUMN revision bigint NOT NULL DEFAULT (\d+)/g,
    ), (match) => Number(match[1]))
    const insertRevision = Number(membershipMigration.match(
      /IF TG_OP = 'INSERT' THEN\s+NEW\.revision := (\d+);/,
    )?.[1])
    const states = [
      membershipMigration.match(/ADD COLUMN state text NOT NULL DEFAULT '(active|left)'/)?.[1],
      pre054Core.match(/CREATE TABLE public\.space_members[\s\S]*?state text NOT NULL DEFAULT '(active|left)'/)?.[1],
    ] as MembershipState[]
    expect({ revisions, states, insertRevision }).toEqual(
      { revisions: [1, 1], states: ['active', 'active'], insertRevision: 1 },
    )
    const voyageSeed = recipe.match(/INSERT INTO public\.voyage_members\(([^)]+)\) VALUES([^;]+);/)
    expect(voyageSeed?.[1].split(',').map((column) => column.trim())).toEqual(['id', 'voyage_id', 'user_id'])
    expect(voyageSeed?.[2].match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/g)?.slice(-3))
      .toEqual([cato.voyageMember, cato.voyage, cato.user])
    expect(seededSpaceFor(cato.user)).toBe(cato.space)
    const resetWrites = membershipWrites(functionBody('reset_parent_child_pair'))
    const rejoinWrites = membershipWrites(functionBody('assert_rejoin_does_not_revive_child'))
    const sequence = recipe.slice(
      recipe.indexOf('\nreset_parent_child_pair\n') + 1,
      recipe.indexOf('\n\nrun_overlap()'),
    )
    const calls = Array.from(sequence.matchAll(
      /^(reset_parent_child_pair|run_parent_child_overlap (?:child-first|parent-first)(?=[ \t]*\\$)|assert_rejoin_does_not_revive_child (?:child-first|parent-first))/gm,
    ), (match) => match[1])
    expect(calls).toEqual(['reset_parent_child_pair', 'run_parent_child_overlap child-first', 'assert_rejoin_does_not_revive_child child-first', 'reset_parent_child_pair', 'run_parent_child_overlap parent-first', 'assert_rejoin_does_not_revive_child parent-first'])
    const overlaps = {
      'child-first': parentChildCall(recipe, 'child-first'),
      'parent-first': parentChildCall(recipe, 'parent-first'),
    }
    expect(overlaps).toEqual({
      'child-first': { holder: { scope: 'space', state: 'active', member: `${cato.space}:${cato.user}` }, contender: { scope: 'voyage', state: 'left', member: cato.voyageMember }, outcome: 'success' },
      'parent-first': { holder: { scope: 'voyage', state: 'left', member: cato.voyageMember }, contender: { scope: 'space', state: 'active', member: `${cato.space}:${cato.user}` }, outcome: 'reject' },
    })
    const ledger: RevisionLedger = {
      voyage: { state: states[0], revision: insertRevision },
      space: { state: states[1], revision: insertRevision },
    }
    for (const call of calls) {
      if (call === 'reset_parent_child_pair') resetWrites.forEach((write) => applyWrite(ledger, write))
      else if (call.startsWith('assert_rejoin')) rejoinWrites.forEach((write) => applyWrite(ledger, write))
      else {
        const phase = call.endsWith('child-first') ? 'child-first' : 'parent-first'
        const overlap = overlaps[phase]
        applyWrite(ledger, overlap.holder)
        if (overlap.outcome === 'success') applyWrite(ledger, overlap.contender)
      }
    }
    const directOverlaps = recipe.slice(
      recipe.indexOf('\nrun_overlap space'),
      recipe.indexOf('\n\nrun_label_overlap()'),
    )
    expect(directOverlaps.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/g)).toEqual(
      [cato.space, '10000000-0000-4000-8000-000000000001', cato.space, '10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002'],
    )
    const overlapBody = functionBody('run_overlap')
    expect(overlapBody.match(/UPDATE public\.\$table SET state = 'left' WHERE \$(?:holder|contender)_where;/g))
      .toEqual(["UPDATE public.$table SET state = 'left' WHERE $holder_where;", "UPDATE public.$table SET state = 'left' WHERE $contender_where;"])
    expect(overlapBody.match(/(?:UPDATE|INSERT INTO|DELETE FROM) public\.\$table/g)).toHaveLength(2)
    const labelRegion = recipe.slice(recipe.indexOf('\nrun_label_overlap profile'), recipe.indexOf('\n\nverdict='))
    const labelPattern = new RegExp(`run_label_overlap (profile|voyage)${shellSeparator}"([^"]+)"${shellSeparator}"([^"]+)"`, 'g')
    const labelCalls = Array.from(labelRegion.matchAll(labelPattern), (match) => (
      { phase: match[1], holder: match[2], writes: membershipWrites(match[3]) }
    ))
    expect(labelCalls.map((call) => call.phase)).toEqual(['profile', 'voyage'])
    expect(labelCalls.map(({ phase, holder }) => ({ phase, holder }))).toEqual([{ phase: 'profile', holder: `UPDATE profiles SET display_name='Cato Renamed' WHERE id='${cato.user}'` }, { phase: 'voyage', holder: `UPDATE voyages SET name='Voyage Renamed' WHERE id='${cato.voyage}'` }])
    labelCalls.flatMap((call) => call.writes).forEach((write) => applyWrite(ledger, write))
    const literalDml = recipe.match(/(?:UPDATE|INSERT INTO|DELETE FROM) (?:public\.)?(?:voyage_members|space_members)\b/g)
    expect({ parsed: membershipWrites(recipe).length, literal: literalDml?.length }).toEqual(
      { parsed: 11, literal: 13 },
    )
    const trace = shellRoleTrace()
    expect({ status: trace.status, stdout: trace.stdout, stderr: trace.stderr })
      .toEqual({ status: 0, stdout: 'SHELL_ROLE_TRACE_GREEN\n', stderr: '' })
    const missingContinuation = recipe.replace('run_parent_child_overlap child-first \\\n', 'run_parent_child_overlap child-first\n')
    expect(() => parentChildCall(missingContinuation, 'child-first'))
      .toThrow('missing child-first parent-child call')
    expect(ledger).toEqual({
      voyage: { state: 'active', revision: 7 },
      space: { state: 'active', revision: 5 },
    })
    expect({ voyage: assertedActiveRevision('voyage_members'), space: assertedActiveRevision('space_members') })
      .toEqual({ voyage: ledger.voyage.revision, space: ledger.space.revision })
  })

  it('overlaps source label writers with membership projectors without stale overwrite', () => {
    for (const fragment of ['run_label_overlap profile', 'run_label_overlap voyage', "application_name IN ('label-$phase-holder','label-$phase-contender')", 'Cato Renamed', 'Voyage Renamed']) expect(recipe).toContain(fragment)
    expect(assertions).toContain('authority_concurrency_source_label_lost')
  })
})
