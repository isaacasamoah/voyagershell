#!/usr/bin/env bash
# K4a structural proof in one disposable, no-network PostgreSQL container.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/docker-proof.sh"
IMAGE=pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee
DATABASE=voyager_cartographer_k4a
CONTAINER_NAME="voyager-cartographer-k4a-$(date +%s)-$$"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-cartographer-k4a.XXXXXX")"
VITE_NODE="$REPO_ROOT/node_modules/.bin/vite-node"
fail() { printf 'cartographer-k4a-local: %s\n' "$1" >&2; exit 1; }
cleanup() { docker_proof_cleanup "$CONTAINER_NAME" ""; rm -rf -- "$TEMP_DIR"; }
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
command -v docker >/dev/null || fail 'docker is required'
docker_proof_detect_security >/dev/null 2>&1 || fail 'Docker daemon is unavailable'
docker image inspect "$IMAGE" >/dev/null 2>&1 \
  || fail 'the pinned pgvector image must already exist locally; pulling is forbidden'
[ -x "$VITE_NODE" ] || fail 'dependencies missing; run npm install first'
docker_proof_run --detach --rm --pull=never --name "$CONTAINER_NAME" --network none \
  --volume "$REPO_ROOT:/workspace:ro" -e POSTGRES_DB="$DATABASE" \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE" >/dev/null
docker_proof_wait_ready "$CONTAINER_NAME" "$DATABASE" || fail 'PostgreSQL readiness timeout'
docker_proof_install_pre054 "$CONTAINER_NAME" "$DATABASE" \
  || fail 'pre-054 installed-state baseline failed'
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
cat > "$TEMP_DIR/denial.sql" <<'SQL'
\set ON_ERROR_STOP off
SET ROLE authenticated;
SELECT count(*) FROM public.knowledge_units;
SELECT count(*) FROM public.knowledge_extraction_attempts;
RESET ROLE;
SQL
docker exec -i "$CONTAINER_NAME" psql -X -q -U postgres -d "$DATABASE" \
  < "$TEMP_DIR/denial.sql" > "$TEMP_DIR/denial-before.txt" 2>&1
grep -q 'permission denied for table knowledge_units' "$TEMP_DIR/denial-before.txt" \
  || fail 'pre-073 unauthorized unit denial missing'
docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/supabase/migrations/073_graph_memory_read.sql" >/dev/null \
  || fail 'candidate migration failed'
docker exec -i "$CONTAINER_NAME" psql -X -q -U postgres -d "$DATABASE" \
  < "$TEMP_DIR/denial.sql" > "$TEMP_DIR/denial-after.txt" 2>&1
cmp -s "$TEMP_DIR/denial-before.txt" "$TEMP_DIR/denial-after.txt" \
  || fail 'pre/post-073 unauthorized denial bytes differ'
verdict="$(docker exec -i "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" < "$REPO_ROOT/recipes/sql/cartographer-k4a-assertions.sql")"
[ "$verdict" = CARTOGRAPHER_K4A_ASSERTIONS_GREEN ] \
  || fail 'exact K4a assertion verdict missing'
K4A_POSTGRES_CONTAINER="$CONTAINER_NAME" K4A_POSTGRES_DATABASE="$DATABASE" \
  "$VITE_NODE" --config "$REPO_ROOT/vitest.config.ts" \
  "$REPO_ROOT/recipes/cartographer-k4a-product-proof.ts" \
  | grep -qx CARTOGRAPHER_K4A_PRODUCT_GREEN \
  || fail 'registered graph_memory product proof failed'
printf '%s\n' CARTOGRAPHER_K4A_LOCAL_GREEN
