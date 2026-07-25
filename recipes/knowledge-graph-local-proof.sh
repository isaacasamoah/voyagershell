#!/usr/bin/env bash
# Disposable exact-candidate PostgreSQL proof; never installs or uses a network.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/docker-proof.sh"
IMAGE=pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee
DATABASE=voyager_graph_local
CONTAINER_NAME="voyager-graph-local-$(date +%s)-$$"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-graph-local.XXXXXX")"
VITE_NODE="$REPO_ROOT/node_modules/.bin/vite-node"

fail() { printf 'knowledge-graph-local: %s\n' "$1" >&2; exit 1; }
cleanup() {
  docker_proof_cleanup "$CONTAINER_NAME"
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
  "$REPO_ROOT"/supabase/migrations/{061,062,063,064,065,066,067,068,069}_*.sql \
  "$REPO_ROOT/$DOCKER_PROOF_PRE054_BASELINE"; do
  [ -f "$file" ] || fail "missing SQL: $file"
done
installed_precondition_assert_fragments "$REPO_ROOT" \
  || fail 'precondition SQL fragments are incomplete'

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
  --gap-output "$TEMP_DIR/gap.sql" \
  --assertions-output "$TEMP_DIR/k1-assertions.sql" --boundary-output "$TEMP_DIR/boundary.sql"
{
  cat <<'SQL'
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '90s';
CREATE TEMP TABLE sequence_guard(initialized boolean, value bigint);
DO $before$
BEGIN
  BEGIN
    INSERT INTO sequence_guard
    VALUES (
      true,
      currval(pg_get_serial_sequence('public.knowledge_events', 'sequence_num')::regclass)
    );
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    INSERT INTO sequence_guard VALUES (false, NULL);
  END;
END
$before$;
SQL
  sed -n '1,$p' "$TEMP_DIR/k1-legacy.sql"
  for number in 054 055 056 057 058 059 060 061 062 063; do
    sed -n '1,$p' "$REPO_ROOT/supabase/migrations/${number}_"*.sql
  done
  sed -n '1,$p' "$TEMP_DIR/k1-historical.sql"
  sed -n '1,$p' "$REPO_ROOT/supabase/migrations/064_"*.sql
  sed -n '1,$p' "$REPO_ROOT/supabase/migrations/065_"*.sql \
    "$REPO_ROOT/supabase/migrations/066_"*.sql
  sed -n '1,$p' "$TEMP_DIR/gap.sql"
  sed -n '1,$p' "$REPO_ROOT/supabase/migrations/067_"*.sql
  sed -n '1,$p' "$REPO_ROOT/supabase/migrations/068_"*.sql \
    "$REPO_ROOT/supabase/migrations/069_"*.sql
  sed -n '1,$p' "$TEMP_DIR/generated.sql" "$TEMP_DIR/k1-assertions.sql" "$TEMP_DIR/boundary.sql"
  cat <<'SQL'
DO $sequence$
DECLARE
  guard sequence_guard;
BEGIN
  SELECT *
  INTO guard
  FROM sequence_guard;

  IF guard.initialized THEN
    IF guard.value <> currval(
      pg_get_serial_sequence('public.knowledge_events', 'sequence_num')::regclass
    ) THEN
      RAISE EXCEPTION 'local_proof_advanced_sequence';
    END IF;
  ELSE
    BEGIN
      PERFORM currval(
        pg_get_serial_sequence('public.knowledge_events', 'sequence_num')::regclass
      );
      RAISE EXCEPTION 'local_proof_initialized_sequence';
    EXCEPTION WHEN object_not_in_prerequisite_state THEN
      NULL;
    END;
  END IF;
END
$sequence$;
ROLLBACK;
SELECT 'KNOWLEDGE_GRAPH_LOCAL_GREEN';
SQL
} > "$TEMP_DIR/transaction.sql"

verdict="$(docker exec -i "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" < "$TEMP_DIR/transaction.sql")"
[ "$verdict" = KNOWLEDGE_GRAPH_LOCAL_GREEN ] || fail 'exact green verdict missing'
printf '%s\n' "$verdict"
