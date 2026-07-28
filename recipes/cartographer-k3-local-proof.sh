#!/usr/bin/env bash
# Exact K3 candidate proof in one disposable, no-network PostgreSQL container.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/docker-proof.sh"
IMAGE=pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee
DATABASE=voyager_cartographer_k3
CONTAINER_NAME="voyager-cartographer-k3-$(date +%s)-$$"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-cartographer-k3.XXXXXX")"
VITE_NODE="$REPO_ROOT/node_modules/.bin/vite-node"
PIDS=""

fail() { printf 'cartographer-k3-local: %s\n' "$1" >&2; exit 1; }
cleanup() {
  docker_proof_cleanup "$CONTAINER_NAME" "$PIDS"
  rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

command -v docker >/dev/null || fail 'docker is required'
docker_proof_detect_security >/dev/null 2>&1 || fail 'Docker daemon is unavailable'
docker image inspect "$IMAGE" >/dev/null 2>&1 \
  || fail 'the pinned pgvector image must already exist locally; pulling is forbidden'
[ -x "$VITE_NODE" ] || fail 'dependencies missing; run npm ci first'
for file in "$REPO_ROOT"/supabase/migrations/{054,055,056,057,058,059,060}_*.sql \
  "$REPO_ROOT"/supabase/migrations/{061,062,063,064,065,066,067,068,069,070,071,072}_*.sql \
  "$REPO_ROOT/recipes/sql/cartographer-k3-setup.sql" \
  "$REPO_ROOT/recipes/sql/cartographer-k3-assertions.sql"; do
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
  --legacy-output "$TEMP_DIR/k1-legacy.sql" --historical-output "$TEMP_DIR/k1-historical.sql" \
  --gap-output "$TEMP_DIR/gap.sql" --assertions-output "$TEMP_DIR/k1-assertions.sql" \
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
    "$REPO_ROOT/supabase/migrations/066_"*.sql
  sed -n '1,$p' "$TEMP_DIR/gap.sql"
  for number in 067 068 069 070 071; do
    sed -n '1,$p' "$REPO_ROOT/supabase/migrations/${number}_"*.sql
  done
  sed -n '1,$p' "$TEMP_DIR/generated.sql" "$TEMP_DIR/k1-assertions.sql" "$TEMP_DIR/boundary.sql"
  sed -n '1,$p' "$REPO_ROOT/supabase/migrations/072_"*.sql
  sed -n '1,$p' "$REPO_ROOT/recipes/sql/cartographer-k3-setup.sql"
  printf 'COMMIT;\n'
} > "$TEMP_DIR/setup.sql"
docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" < "$TEMP_DIR/setup.sql" >/dev/null \
  || fail 'candidate migration or setup failed'

source_id="$(docker exec "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" -c \
  "SELECT id FROM public.knowledge_events WHERE content='Elisheya keeps the amber notebook.'")"
[ -n "$source_id" ] || fail 'concurrency source missing'
for index in $(seq 1 25); do
  docker exec "$CONTAINER_NAME" psql -X -Atq -F '|' -v ON_ERROR_STOP=1 \
    -U postgres -d "$DATABASE" -c \
    "SELECT attempt_id,lease_token FROM public.begin_knowledge_extraction_attempt(
      '72000000-0000-4000-8000-000000000001','anthropic','claude-sonnet-4-6',
      'claude-sonnet','$source_id',1)" > "$TEMP_DIR/begin-$index.out" &
  PIDS="$PIDS $!"
done
for pid in $PIDS; do wait "$pid" || fail 'concurrent lease claim failed'; done
PIDS=""
sed '/^$/d' "$TEMP_DIR"/begin-*.out > "$TEMP_DIR/begin-winners"
[ "$(wc -l < "$TEMP_DIR/begin-winners" | tr -d ' ')" = 1 ] \
  || fail '25 lease claims did not produce exactly one winner'

sleep 2
second="$(docker exec "$CONTAINER_NAME" psql -X -Atq -F '|' -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" -c \
  "SELECT attempt_id,lease_token FROM public.begin_knowledge_extraction_attempt(
    '72000000-0000-4000-8000-000000000001','anthropic','claude-sonnet-4-6',
    'claude-sonnet','$source_id',120)")"
[ -n "$second" ] || fail 'expired lease was not reclaimed'
attempt_id="${second%%|*}"
lease_token="${second#*|}"

for index in $(seq 1 25); do
  docker exec "$CONTAINER_NAME" psql -X -Atq -F '|' -v ON_ERROR_STOP=1 \
    -U postgres -d "$DATABASE" -c \
    "SELECT outcome,unit_id,replayed FROM public.complete_knowledge_extraction_attempt(
      '$attempt_id','$lease_token','succeeded',
      '{\"claim\":\"Elisheya keeps the amber notebook.\",\"aboutPersonId\":\"72000000-0000-4000-8000-000000000002\",\"knowledgeType\":\"domain\",\"attentionScore\":0.8,\"contextSnippet\":\"Elisheya keeps the amber notebook.\"}',
      'Elisheya keeps the amber notebook.','72000000-0000-4000-8000-000000000002',
      NULL,120,30)" > "$TEMP_DIR/complete-$index.out" &
  PIDS="$PIDS $!"
done
for pid in $PIDS; do wait "$pid" || fail 'concurrent completion failed'; done
PIDS=""
[ "$(rg -l '^succeeded\\|' "$TEMP_DIR"/complete-*.out | wc -l | tr -d ' ')" = 25 ] \
  || fail '25 identical completions were not safely replayed'

verdict="$(docker exec -i "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k3-assertions.sql")"
[ "$verdict" = CARTOGRAPHER_K3_ASSERTIONS_GREEN ] \
  || fail 'exact K3 assertion verdict missing'
printf '%s\n' CARTOGRAPHER_K3_LOCAL_GREEN
