#!/usr/bin/env bash
# K5a C3 selecting-read PoC in one disposable, no-network PostgreSQL container.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/docker-proof.sh"
IMAGE=pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee
DATABASE=voyager_cartographer_k5a_c3
CONTAINER_NAME="voyager-cartographer-k5a-c3-$(date +%s)-$$"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-cartographer-k5a-c3.XXXXXX")"
VITE_NODE="$REPO_ROOT/node_modules/.bin/vite-node"
BOUNDARY_SOURCE="$REPO_ROOT/lib/knowledge/kernel/boundary.ts"
RELATION_CONTRACT_SOURCE="$REPO_ROOT/lib/agents/cartographer/relation-conflict-contract.json"
PIDS=()
FOREGROUND_PID=

fail() { printf 'cartographer-k5a-c3-local: %s\n' "$1" >&2; exit 1; }
cleanup() {
  cleanup_status=$?
  trap - EXIT
  set +e
  docker_proof_cleanup "$CONTAINER_NAME" "${PIDS[*]-}"
  rm -rf -- "$TEMP_DIR"
  exit "$cleanup_status"
}
track_pid() { PIDS+=("$1"); }
run_interruptible() {
  local command_status
  "$@" <&0 &
  FOREGROUND_PID=$!
  if wait "$FOREGROUND_PID"; then
    command_status=0
  else
    command_status=$?
  fi
  FOREGROUND_PID=
  return "$command_status"
}
reap_pids() {
  local pid failed=0
  for pid in "${PIDS[@]}"; do
    wait "$pid" || failed=1
  done
  PIDS=()
  return "$failed"
}
handle_signal() {
  trap - HUP INT TERM
  if [ -n "$FOREGROUND_PID" ]; then
    kill "$FOREGROUND_PID" 2>/dev/null || true
  fi
  exit 130
}
trap cleanup EXIT
trap handle_signal HUP INT TERM

command -v docker >/dev/null || fail 'docker is required'
docker_proof_detect_security >/dev/null 2>&1 || fail 'Docker daemon is unavailable'
docker image inspect "$IMAGE" >/dev/null 2>&1 \
  || fail 'the pinned pgvector image must already exist locally; pulling is forbidden'
[ -x "$VITE_NODE" ] || fail 'dependencies missing; run npm install first'
[ -f "$BOUNDARY_SOURCE" ] || fail 'knowledge-kernel boundary source is missing'
[ -f "$RELATION_CONTRACT_SOURCE" ] || fail 'relation contract source is missing'
PER_CLAIM_PARTNER_CAP="$(node -e '
  const fs = require("node:fs")
  const ts = require("typescript")
  const source = fs.readFileSync(process.argv[1], "utf8")
  const file = ts.createSourceFile(
    process.argv[1], source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  )
  const caps = []
  const visit = (node) => {
    if (ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "normalizeBudget" &&
        node.arguments.length === 4) {
      const [value, , , maximum] = node.arguments
      if (ts.isPropertyAccessExpression(value) &&
          ts.isIdentifier(value.expression) &&
          value.expression.text === "options" &&
          value.name.text === "perClaimPartnerCap" &&
          ts.isNumericLiteral(maximum)) {
        caps.push(maximum.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (caps.length !== 1) process.exit(1)
  process.stdout.write(caps[0])
' "$BOUNDARY_SOURCE")" \
  || fail 'could not read the per-claim partner cap from the boundary source'
RESPONSE_FLOOR_MS="$(node -e '
  const fs = require("node:fs")
  const ts = require("typescript")
  const source = fs.readFileSync(process.argv[1], "utf8")
  const file = ts.createSourceFile(
    process.argv[1], source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  )
  const floors = []
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "RESPONSE_FLOOR_MS" &&
        node.initializer && ts.isNumericLiteral(node.initializer)) {
      floors.push(node.initializer.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (floors.length !== 1) process.exit(1)
  process.stdout.write(floors[0])
' "$BOUNDARY_SOURCE")" \
  || fail 'could not read RESPONSE_FLOOR_MS from the boundary source'
RELATION_CANDIDATE_LIMIT="$(node -e '
  const fs = require("node:fs")
  const contract = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  process.stdout.write(String(contract.blocking.candidateLimit))
' "$RELATION_CONTRACT_SOURCE")" \
  || fail 'could not read candidateLimit from the active relation contract'
[[ "$PER_CLAIM_PARTNER_CAP" =~ ^[1-9][0-9]*$ ]] \
  || fail 'per-claim partner cap is not a positive integer'
[[ "$RESPONSE_FLOOR_MS" =~ ^[1-9][0-9]*$ ]] \
  || fail 'response floor is not a positive integer'
[[ "$RELATION_CANDIDATE_LIMIT" =~ ^[1-9][0-9]*$ ]] \
  || fail 'relation candidate limit is not a positive integer'
for file in "$REPO_ROOT"/supabase/migrations/{054,055,056,057,058,059,060}_*.sql \
  "$REPO_ROOT"/supabase/migrations/{061,062,063,064,065,066,067,068,069,070,071,072,073,074,075,076,077,078,079}_*.sql \
  "$REPO_ROOT/recipes/sql/cartographer-k3-setup.sql" \
  "$REPO_ROOT/recipes/sql/cartographer-k4b-v3-residue.sql" \
  "$REPO_ROOT/recipes/sql/cartographer-k4b-assertions.sql" \
  "$REPO_ROOT/recipes/sql/cartographer-k4c-assertions.sql" \
  "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-poc.sql" \
  "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-r7-shapes.sql" \
  "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-realistic.sql" \
  "$REPO_ROOT/recipes/sql/cartographer-k5a-c4-r5-assertions.sql" \
  "$REPO_ROOT/recipes/sql/cartographer-k5a-floor-measurement.sql" \
  "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-probe.sql"; do
  [ -f "$file" ] || fail "missing SQL: $file"
done

docker_run_args=(--detach --rm --pull=never --name "$CONTAINER_NAME" --network none)
if [ "$DOCKER_PROOF_SELINUX" = true ]; then
  docker_run_args=(--security-opt label=disable "${docker_run_args[@]}")
fi
run_interruptible docker run "${docker_run_args[@]}" \
  --volume "$REPO_ROOT:/workspace:ro" -e POSTGRES_DB="$DATABASE" \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE" >/dev/null
run_interruptible docker_proof_wait_ready "$CONTAINER_NAME" "$DATABASE" \
  || fail 'PostgreSQL readiness timeout'
run_interruptible docker_proof_install_pre054 "$CONTAINER_NAME" "$DATABASE" \
  || fail 'pre-054 installed-state baseline or contract failed'

"$VITE_NODE" "$REPO_ROOT/lib/knowledge/kernel/generate-sql.ts" \
  --output "$TEMP_DIR/generated.sql"
"$VITE_NODE" "$REPO_ROOT/lib/knowledge/kernel/generate-k1-sql.ts" \
  --legacy-output "$TEMP_DIR/k1-legacy.sql" \
  --historical-output "$TEMP_DIR/k1-historical.sql" \
  --gap-output "$TEMP_DIR/gap.sql" \
  --assertions-output "$TEMP_DIR/k1-assertions.sql" \
  --boundary-output "$TEMP_DIR/boundary.sql"
{
  printf 'BEGIN;\n'
  sed -n '1,$p' "$TEMP_DIR/k1-legacy.sql"
  for number in 054 055 056 057 058 059 060 061 062 063; do
    sed -n '1,$p' "$REPO_ROOT/supabase/migrations/${number}_"*.sql
  done
  sed -n '1,$p' "$TEMP_DIR/k1-historical.sql"
  sed -n '1,$p' "$REPO_ROOT/supabase/migrations/064_"*.sql
  sed -n '1,$p' "$REPO_ROOT/supabase/migrations/065_"*.sql \
    "$REPO_ROOT/supabase/migrations/066_"*.sql "$TEMP_DIR/gap.sql"
  for number in 067 068 069 070 071; do
    sed -n '1,$p' "$REPO_ROOT/supabase/migrations/${number}_"*.sql
  done
  sed -n '1,$p' "$TEMP_DIR/generated.sql" "$TEMP_DIR/k1-assertions.sql" \
    "$TEMP_DIR/boundary.sql" "$REPO_ROOT/supabase/migrations/072_"*.sql \
    "$REPO_ROOT/recipes/sql/cartographer-k3-setup.sql"
  printf 'COMMIT;\n'
} > "$TEMP_DIR/setup.sql"
run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" < "$TEMP_DIR/setup.sql" >/dev/null \
  || fail 'pre-073 setup failed'

for sql_file in \
  "$REPO_ROOT/supabase/migrations/073_graph_memory_read.sql" \
  "$REPO_ROOT/supabase/migrations/074_topic_nodes.sql" \
  "$REPO_ROOT/recipes/sql/cartographer-k4b-v3-residue.sql" \
  "$REPO_ROOT/supabase/migrations/075_topic_identity_matcher.sql" \
  "$REPO_ROOT/supabase/migrations/076_topic_identity_hardening.sql"; do
  run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
    -U postgres -d "$DATABASE" < "$sql_file" >/dev/null \
    || fail "migration setup failed: $(basename "$sql_file")"
done
run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >/dev/null <<'SQL'
SELECT public.activate_knowledge_topic_contract();
SQL
run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k4b-assertions.sql" >/dev/null \
  || fail 'K4b fixture setup failed'
run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/supabase/migrations/077_relation_conflict_ledger.sql" >/dev/null \
  || fail 'migration 077 failed'
run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k4c-assertions.sql" >/dev/null \
  || fail 'K4c fixture setup failed'
for pass in 1 2; do
  for number in 078 079; do
    sql_file=("$REPO_ROOT/supabase/migrations/${number}_"*.sql)
    run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
      -U postgres -d "$DATABASE" < "${sql_file[0]}" >/dev/null \
      || fail "migration $number pass $pass failed"
  done
done

run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -Atq \
  -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-poc.sql" \
  > "$TEMP_DIR/c3-small-verdict.out" \
  || fail 'C3 seeded-corpus assertions failed'
verdict="$(<"$TEMP_DIR/c3-small-verdict.out")"
[ "$verdict" = CARTOGRAPHER_K5A_C3_R7_SMALL_GREEN ] \
  || fail 'exact small-regime C3 verdict missing'

run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -Atq \
  -v ON_ERROR_STOP=1 \
  -v per_claim_partner_cap="$PER_CLAIM_PARTNER_CAP" \
  -v relation_candidate_limit="$RELATION_CANDIDATE_LIMIT" \
  -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-r7-shapes.sql" \
  > "$TEMP_DIR/c3-shape-verdict.out" \
  || fail 'C3 R7 shape-space assertions failed'
shape_verdict="$(<"$TEMP_DIR/c3-shape-verdict.out")"
[ "$shape_verdict" = CARTOGRAPHER_K5A_C3_R7_SHAPES_GREEN ] \
  || fail 'exact C3 R7 shape-space verdict missing'

for index in $(seq 1 8); do
  docker exec -i "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
    -U postgres -d "$DATABASE" \
    < "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-probe.sql" \
    > "$TEMP_DIR/probe-$index.out" 2>&1 &
  track_pid "$!"
done
reap_pids || fail 'one or more small-regime concurrent probes failed'
probe_verdicts="$(rg --no-filename -N '^K5A_C3_CONCURRENT_PROBE_GREEN$' \
  "$TEMP_DIR"/probe-*.out | wc -l | tr -d ' ')"
[ "$probe_verdicts" = 8 ] \
  || fail "8 small-regime concurrent probes produced $probe_verdicts green verdicts"

run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -Atq \
  -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-realistic.sql" \
  > "$TEMP_DIR/c3-realistic-verdict.out" \
  || fail 'C3 realistic-regime assertions failed'
realistic_verdict="$(<"$TEMP_DIR/c3-realistic-verdict.out")"
[ "$realistic_verdict" = CARTOGRAPHER_K5A_C3_R7_REALISTIC_GREEN ] \
  || fail 'exact realistic-regime C3 verdict missing'

for index in $(seq 1 8); do
  docker exec -i "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
    -U postgres -d "$DATABASE" \
    < "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-probe.sql" \
    > "$TEMP_DIR/realistic-probe-$index.out" 2>&1 &
  track_pid "$!"
done
reap_pids || fail 'one or more realistic-regime concurrent probes failed'
probe_verdicts="$(rg --no-filename -N '^K5A_C3_CONCURRENT_PROBE_GREEN$' \
  "$TEMP_DIR"/realistic-probe-*.out | wc -l | tr -d ' ')"
[ "$probe_verdicts" = 8 ] \
  || fail "8 realistic-regime concurrent probes produced $probe_verdicts green verdicts"

run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -Atq \
  -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k5a-c4-r5-assertions.sql" \
  > "$TEMP_DIR/c4-r5-verdict.out" \
  || fail 'C4 R5 exact authorized-subset assertions failed'
c4_verdict="$(<"$TEMP_DIR/c4-r5-verdict.out")"
[ "$c4_verdict" = CARTOGRAPHER_K5A_C4_R5_GREEN ] \
  || fail 'exact C4 R5 verdict missing'

if [ "${K5A_FLOOR_MEASUREMENT:-0}" = 1 ]; then
  run_interruptible docker exec -i "$CONTAINER_NAME" psql -X -Atq \
    -v ON_ERROR_STOP=1 -v existing_response_floor_ms="$RESPONSE_FLOOR_MS" \
    -U postgres -d "$DATABASE" \
    < "$REPO_ROOT/recipes/sql/cartographer-k5a-floor-measurement.sql" \
    > "$TEMP_DIR/floor-database-verdict.out" \
    || fail 'clean floor database measurement failed'
  floor_verdict="$(<"$TEMP_DIR/floor-database-verdict.out")"
  [ "$floor_verdict" = CARTOGRAPHER_K5A_FLOOR_DATABASE_GREEN ] \
    || fail 'exact clean floor database verdict missing'
  printf '%s\n' CARTOGRAPHER_K5A_FLOOR_DATABASE_GREEN
fi

printf '%s\n' CARTOGRAPHER_K5A_C3_LOCAL_GREEN
