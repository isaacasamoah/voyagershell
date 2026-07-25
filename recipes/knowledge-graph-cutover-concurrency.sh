#!/usr/bin/env bash
# Disposable proof that the legacy-edge lock closes the cutover writer window.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/docker-proof.sh"
IMAGE=pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee
DATABASE=voyager_cutover
CONTAINER_NAME="voyager-cutover-concurrency-$(date +%s)-$$"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-cutover.XXXXXX")"
GRAPH_DIR=supabase/migrations
PIDS=''

fail() { printf 'cutover-concurrency: %s\n' "$1" >&2; exit 1; }
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
for path in "$DOCKER_PROOF_PRE054_BASELINE" \
  supabase/migrations/054_active_membership_authority.sql \
  "$GRAPH_DIR/061_knowledge_graph_schema.sql" "$GRAPH_DIR/062_knowledge_graph_authorization.sql" \
  "$GRAPH_DIR/063_knowledge_graph_retrieval.sql" "$GRAPH_DIR/064_knowledge_graph_cutover.sql"; do
  [ -f "$REPO_ROOT/$path" ] || fail "missing proof SQL: $path"
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
docker exec "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 --single-transaction \
  -U postgres -d "$DATABASE" -f "/workspace/supabase/migrations/054_active_membership_authority.sql" >/dev/null
for number in 061 062 063; do
  file="$(printf '/workspace/%s/%s_' "$GRAPH_DIR" "$number")"
  candidate="$(docker exec "$CONTAINER_NAME" sh -c "ls ${file}*.sql")"
  docker exec "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 --single-transaction \
    -U postgres -d "$DATABASE" -f "$candidate" >/dev/null
done

docker exec -i "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" <<'SQL'
INSERT INTO auth.users(id) VALUES ('10000000-0000-4000-8000-000000000011');
UPDATE public.profiles SET display_name = 'Cutover Owner', username = 'cutover'
WHERE id = '10000000-0000-4000-8000-000000000011';
INSERT INTO public.knowledge_events(id, user_id, content, participants, sequence_num) VALUES
  ('61000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011',
    'cutover source', ARRAY['10000000-0000-4000-8000-000000000011'::uuid], -319401),
  ('61000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000011',
    'cutover target', ARRAY['10000000-0000-4000-8000-000000000011'::uuid], -319402);
SET ROLE authenticated;
INSERT INTO public.knowledge_edges(id, source_id, target_id, edge_type, created_by, created_at) VALUES
  ('81000000-0000-4000-8000-000000000011', '61000000-0000-4000-8000-000000000011',
    '61000000-0000-4000-8000-000000000012', 'relates_to', 'spoofed-authenticated',
    '2026-07-24T00:00:00Z');
RESET ROLE;
SQL

docker exec -i -e PGAPPNAME=cutover-holder "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >"$TEMP_DIR/holder.log" 2>&1 <<SQL &
BEGIN;
\i /workspace/$GRAPH_DIR/064_knowledge_graph_cutover.sql
SELECT pg_sleep(4);
COMMIT;
SQL
holder_pid=$!; PIDS="$PIDS $holder_pid"
for ((attempt = 0; attempt < 60; attempt++)); do
  sleeping="$(docker exec "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" -c \
    "SELECT count(*) FROM pg_stat_activity WHERE application_name='cutover-holder' AND wait_event='PgSleep'")"
  [ "$sleeping" = 1 ] && break
  sleep 0.1
done
[ "${sleeping:-0}" = 1 ] || fail 'cutover holder did not reach lock-holding sleep'

docker exec -i -e PGAPPNAME=cutover-contender "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >"$TEMP_DIR/contender.log" 2>&1 <<'SQL' &
SET ROLE authenticated;
INSERT INTO public.knowledge_edges(id, source_id, target_id, edge_type, created_by) VALUES
  ('81000000-0000-4000-8000-000000000012', '61000000-0000-4000-8000-000000000011',
    '61000000-0000-4000-8000-000000000012', 'relates_to', 'late-forged-authenticated');
SQL
contender_pid=$!; PIDS="$PIDS $contender_pid"
for ((attempt = 0; attempt < 60; attempt++)); do
  blocked="$(docker exec "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" -c \
    "SELECT count(*) FROM pg_stat_activity c WHERE c.application_name='cutover-contender' AND c.wait_event_type='Lock' AND cardinality(pg_blocking_pids(c.pid)) > 0")"
  [ "$blocked" = 1 ] && break
  sleep 0.1
done
[ "${blocked:-0}" = 1 ] || fail 'late writer did not block behind cutover'
if ! wait "$holder_pid"; then sed -n '1,120p' "$TEMP_DIR/holder.log" >&2; fail 'cutover failed'; fi
if wait "$contender_pid"; then fail 'late legacy writer committed'; fi

verdict="$(docker exec -i "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" <<'SQL'
DO $proof$
BEGIN
  IF to_regclass('public.knowledge_edges') IS NOT NULL
    OR (SELECT count(*) FROM public.knowledge_graph_backfill_rejections
      WHERE source_kind='knowledge_edge' AND reason='legacy_edge_unattested'
        AND source_digest=md5(jsonb_build_array('knowledge_edge:v1',
          '81000000-0000-4000-8000-000000000011'::uuid,
          '61000000-0000-4000-8000-000000000011'::uuid,
          '61000000-0000-4000-8000-000000000012'::uuid, 'relates_to',
          'spoofed-authenticated',
          extract(epoch FROM '2026-07-24T00:00:00Z'::timestamptz))::text)) <> 1
    OR EXISTS (SELECT 1 FROM public.graph_edges) THEN
    RAISE EXCEPTION 'cutover_legacy_evidence_failed'; END IF;
END $proof$;
SET ROLE service_role;
SELECT public.write_knowledge_graph_edge('message_event',
  '61000000-0000-4000-8000-000000000011', 'message_event',
  '61000000-0000-4000-8000-000000000012', 'relates_to');
RESET ROLE;
DO $writer$
BEGIN
  IF (SELECT count(*) FROM public.graph_edges) <> 1
    OR (SELECT count(*) FROM public.graph_edge_evidence) <> 1 THEN
    RAISE EXCEPTION 'cutover_final_writer_failed'; END IF;
END $writer$;
SELECT 'KNOWLEDGE_GRAPH_CUTOVER_CONCURRENCY_GREEN';
SQL
)"
[ "$verdict" = $'t\nKNOWLEDGE_GRAPH_CUTOVER_CONCURRENCY_GREEN' ] \
  || fail 'exact green verdict missing'
printf '%s\n' KNOWLEDGE_GRAPH_CUTOVER_CONCURRENCY_GREEN
