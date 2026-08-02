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
PIDS=()

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
reap_pids() {
  local pid failed=0
  for pid in "${PIDS[@]}"; do
    wait "$pid" || failed=1
  done
  PIDS=()
  return "$failed"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

command -v docker >/dev/null || fail 'docker is required'
docker_proof_detect_security >/dev/null 2>&1 || fail 'Docker daemon is unavailable'
docker image inspect "$IMAGE" >/dev/null 2>&1 \
  || fail 'the pinned pgvector image must already exist locally; pulling is forbidden'
[ -x "$VITE_NODE" ] || fail 'dependencies missing; run npm install first'
for file in "$REPO_ROOT"/supabase/migrations/{054,055,056,057,058,059,060}_*.sql \
  "$REPO_ROOT"/supabase/migrations/{061,062,063,064,065,066,067,068,069,070,071,072,073,074,075,076,077,078,079}_*.sql \
  "$REPO_ROOT/recipes/sql/cartographer-k3-setup.sql" \
  "$REPO_ROOT/recipes/sql/cartographer-k4b-v3-residue.sql" \
  "$REPO_ROOT/recipes/sql/cartographer-k4b-assertions.sql" \
  "$REPO_ROOT/recipes/sql/cartographer-k4c-assertions.sql" \
  "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-poc.sql" \
  "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-probe.sql"; do
  [ -f "$file" ] || fail "missing SQL: $file"
done

docker_proof_run --detach --rm --pull=never --name "$CONTAINER_NAME" --network none \
  --volume "$REPO_ROOT:/workspace:ro" -e POSTGRES_DB="$DATABASE" \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE" >/dev/null
docker_proof_wait_ready "$CONTAINER_NAME" "$DATABASE" \
  || fail 'PostgreSQL readiness timeout'
docker_proof_install_pre054 "$CONTAINER_NAME" "$DATABASE" \
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
docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" < "$TEMP_DIR/setup.sql" >/dev/null \
  || fail 'pre-073 setup failed'

for sql_file in \
  "$REPO_ROOT/supabase/migrations/073_graph_memory_read.sql" \
  "$REPO_ROOT/supabase/migrations/074_topic_nodes.sql" \
  "$REPO_ROOT/recipes/sql/cartographer-k4b-v3-residue.sql" \
  "$REPO_ROOT/supabase/migrations/075_topic_identity_matcher.sql" \
  "$REPO_ROOT/supabase/migrations/076_topic_identity_hardening.sql"; do
  docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
    -U postgres -d "$DATABASE" < "$sql_file" >/dev/null \
    || fail "migration setup failed: $(basename "$sql_file")"
done
docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >/dev/null <<'SQL'
SELECT public.activate_knowledge_topic_contract();
SQL
docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k4b-assertions.sql" >/dev/null \
  || fail 'K4b fixture setup failed'
docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/supabase/migrations/077_relation_conflict_ledger.sql" >/dev/null \
  || fail 'migration 077 failed'
docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k4c-assertions.sql" >/dev/null \
  || fail 'K4c fixture setup failed'
for pass in 1 2; do
  for number in 078 079; do
    sql_file=("$REPO_ROOT/supabase/migrations/${number}_"*.sql)
    docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
      -U postgres -d "$DATABASE" < "${sql_file[0]}" >/dev/null \
      || fail "migration $number pass $pass failed"
  done
done

verdict="$(docker exec -i "$CONTAINER_NAME" psql -X -Atq \
  -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-poc.sql")" \
  || fail 'C3 seeded-corpus assertions failed'
[ "$verdict" = CARTOGRAPHER_K5A_C3_R3_POC_GREEN ] \
  || fail 'exact C3 PoC verdict missing'

for index in $(seq 1 8); do
  docker exec -i "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
    -U postgres -d "$DATABASE" \
    < "$REPO_ROOT/recipes/sql/cartographer-k5a-c3-probe.sql" \
    > "$TEMP_DIR/probe-$index.out" 2>&1 &
  track_pid "$!"
done
reap_pids || fail 'one or more concurrent suppressed-pair probes failed'
probe_verdicts="$(rg --no-filename -N '^K5A_C3_CONCURRENT_PROBE_GREEN$' \
  "$TEMP_DIR"/probe-*.out | wc -l | tr -d ' ')"
[ "$probe_verdicts" = 8 ] \
  || fail "8 concurrent probes produced $probe_verdicts green verdicts"

printf '%s\n' CARTOGRAPHER_K5A_C3_LOCAL_GREEN
