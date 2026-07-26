#!/usr/bin/env bash
# Disposable two-session proof for authority-projection serialization.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/docker-proof.sh"
IMAGE=pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee
DATABASE="voyager_concurrency"
CONTAINER_NAME="voyager-authority-concurrency-$(date +%s)-$$"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-authority-concurrency.XXXXXX")"
MIGRATIONS=(
  supabase/migrations/054_active_membership_authority.sql
  supabase/migrations/061_knowledge_graph_schema.sql
  supabase/migrations/062_knowledge_graph_authorization.sql
  supabase/migrations/065_knowledge_graph_authority_projection.sql
  supabase/migrations/066_knowledge_graph_membership_projection.sql
  supabase/migrations/067_knowledge_graph_projection_activation.sql
)
ASSERTIONS=recipes/sql/knowledge-graph/authority-projection-assertions.sql
PIDS=''

fail() { printf 'authority-concurrency: %s\n' "$1" >&2; exit 1; }
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
for migration in "${MIGRATIONS[@]}"; do
  [ -f "$REPO_ROOT/$migration" ] || fail "missing migration: $migration"
done
[ -f "$REPO_ROOT/$DOCKER_PROOF_PRE054_BASELINE" ] \
  || fail "missing baseline: $DOCKER_PROOF_PRE054_BASELINE"
installed_precondition_assert_fragments "$REPO_ROOT" \
  || fail 'precondition SQL fragments are incomplete'
[ -f "$REPO_ROOT/$ASSERTIONS" ] || fail "missing assertions: $ASSERTIONS"

docker_proof_run --detach --rm --pull=never --name "$CONTAINER_NAME" --network none \
  --volume "$REPO_ROOT:/workspace:ro" -e POSTGRES_DB="$DATABASE" \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE" >/dev/null
docker_proof_wait_ready "$CONTAINER_NAME" "$DATABASE" \
  || fail 'PostgreSQL readiness timeout'

docker_proof_install_pre054 "$CONTAINER_NAME" "$DATABASE" \
  || fail 'pre-054 installed-state baseline or contract failed'
for migration in "${MIGRATIONS[@]}"; do
  docker exec "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 --single-transaction \
    -U postgres -d "$DATABASE" -f "/workspace/$migration" >/dev/null
done

docker exec -i "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" <<'SQL'
BEGIN;
INSERT INTO auth.users(id) VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');
UPDATE public.profiles SET
  display_name = CASE id
    WHEN '10000000-0000-4000-8000-000000000001' THEN 'Ada'
    WHEN '10000000-0000-4000-8000-000000000002' THEN 'Bela' ELSE 'Cato' END,
  username = CASE id
    WHEN '10000000-0000-4000-8000-000000000001' THEN 'ada'
    WHEN '10000000-0000-4000-8000-000000000002' THEN 'bela' ELSE 'cato' END
WHERE id::text LIKE '10000000-0000-4000-8000-00000000000%';
INSERT INTO public.voyages(id, slug, name) VALUES
  ('20000000-0000-4000-8000-000000000001', 'authority-concurrency-voyage', 'Concurrency Voyage');
INSERT INTO public.spaces(id, voyage_id) VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
INSERT INTO public.voyage_members(id, voyage_id, user_id) VALUES
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003');
INSERT INTO public.space_members(space_id, user_id) VALUES
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003');
COMMIT;
SQL

wait_for_query() {
  local sql="$1" label="$2" observed
  for ((attempt = 0; attempt < 50; attempt++)); do
    observed="$(docker exec "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" -c "$sql")" \
      || fail "$label observer failed"
    [ "$observed" = 1 ] && return
    sleep 0.1
  done
  fail "$label timeout"
}

reset_parent_child_pair() {
  docker exec -i "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 \
    -U postgres -d "$DATABASE" >/dev/null <<'SQL'
UPDATE public.voyage_members SET state = 'active'
WHERE id = '40000000-0000-4000-8000-000000000003';
UPDATE public.space_members SET state = 'left'
WHERE space_id = '30000000-0000-4000-8000-000000000001'
  AND user_id = '10000000-0000-4000-8000-000000000003';
SQL
}

run_parent_child_overlap() {
  local phase="$1" holder_sql="$2" contender_sql="$3" contender_result="$4"
  local holder_app="parent-child-$phase-holder"
  local contender_app="parent-child-$phase-contender"
  docker exec -i -e "PGAPPNAME=$holder_app" "$CONTAINER_NAME" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" >"$TEMP_DIR/$phase-holder.log" 2>&1 <<SQL &
BEGIN;
SET LOCAL lock_timeout = '10s'; SET LOCAL statement_timeout = '15s';
$holder_sql
SELECT pg_sleep(4);
COMMIT;
SQL
  local holder_pid=$!; PIDS="$PIDS $holder_pid"
  wait_for_query "SELECT count(*) FROM pg_stat_activity WHERE application_name = '$holder_app' AND wait_event = 'PgSleep'" "$phase parent-child holder"
  docker exec -i -e "PGAPPNAME=$contender_app" "$CONTAINER_NAME" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" >"$TEMP_DIR/$phase-contender.log" 2>&1 <<SQL &
BEGIN;
SET LOCAL lock_timeout = '10s'; SET LOCAL statement_timeout = '15s';
$contender_sql
COMMIT;
SQL
  local contender_pid=$!; PIDS="$PIDS $contender_pid"
  wait_for_query \
    "SELECT count(*) FROM pg_stat_activity c
     JOIN LATERAL unnest(pg_blocking_pids(c.pid)) blocker(pid) ON true
     JOIN pg_stat_activity h ON h.pid = blocker.pid
       AND h.application_name = '$holder_app'
     WHERE c.application_name = '$contender_app'
       AND c.wait_event_type = 'Lock'" \
    "$phase parent-child block"
  if ! wait "$holder_pid"; then sed -n '1,120p' "$TEMP_DIR/$phase-holder.log" >&2; fail "$phase parent-child holder failed"; fi
  if [ "$contender_result" = success ]; then
    if ! wait "$contender_pid"; then sed -n '1,120p' "$TEMP_DIR/$phase-contender.log" >&2; fail "$phase parent-child contender failed"; fi
  elif wait "$contender_pid"; then
    fail "$phase parent-child activation was accepted"
  elif ! grep -Fq 'space_member_parent_membership_required' "$TEMP_DIR/$phase-contender.log"; then
    fail "$phase parent-child rejection was not exact"
  fi
}

assert_rejoin_does_not_revive_child() {
  local phase="$1" observed
  observed="$(docker exec "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
    -U postgres -d "$DATABASE" -c "
      UPDATE public.voyage_members SET state = 'active'
      WHERE id = '40000000-0000-4000-8000-000000000003';
      SELECT concat_ws('|', parent.state, child.state,
        public.is_effective_space_member(child.space_id, child.user_id)::text)
      FROM public.voyage_members parent
      JOIN public.space_members child ON child.user_id = parent.user_id
      WHERE parent.id = '40000000-0000-4000-8000-000000000003'
        AND child.space_id = '30000000-0000-4000-8000-000000000001';")"
  [ "$observed" = 'active|left|false' ] \
    || fail "$phase parent rejoin revived child membership"
}

reset_parent_child_pair
run_parent_child_overlap child-first \
  "INSERT INTO public.space_members(space_id, user_id, state)
   VALUES ('30000000-0000-4000-8000-000000000001',
     '10000000-0000-4000-8000-000000000003', 'active')
   ON CONFLICT (space_id, user_id) DO UPDATE SET state = EXCLUDED.state;" \
  "UPDATE public.voyage_members SET state = 'left' WHERE id = '40000000-0000-4000-8000-000000000003';" success
assert_rejoin_does_not_revive_child child-first
reset_parent_child_pair
run_parent_child_overlap parent-first \
  "UPDATE public.voyage_members SET state = 'left' WHERE id = '40000000-0000-4000-8000-000000000003';" \
  "INSERT INTO public.space_members(space_id, user_id, state)
   VALUES ('30000000-0000-4000-8000-000000000001',
     '10000000-0000-4000-8000-000000000003', 'active')
   ON CONFLICT (space_id, user_id) DO UPDATE SET state = EXCLUDED.state;" reject
assert_rejoin_does_not_revive_child parent-first

run_overlap() {
  local phase="$1" table="$2" holder_where="$3" contender_where="$4"
  local holder_app="authority-${phase}-holder" contender_app="authority-${phase}-contender"
  docker exec -i -e "PGAPPNAME=$holder_app" "$CONTAINER_NAME" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" >"$TEMP_DIR/$phase-holder.log" 2>&1 <<SQL &
BEGIN;
SET LOCAL lock_timeout = '10s'; SET LOCAL statement_timeout = '15s';
UPDATE public.$table SET state = 'left' WHERE $holder_where;
SELECT pg_sleep(4);
COMMIT;
SQL
  local holder_pid=$!; PIDS="$PIDS $holder_pid"
  wait_for_query "SELECT count(*) FROM pg_stat_activity a WHERE a.application_name = '$holder_app' AND a.wait_event = 'PgSleep' AND EXISTS (SELECT 1 FROM pg_locks l WHERE l.pid = a.pid AND l.locktype = 'advisory' AND l.granted)" "$phase holder lock"
  docker exec -i -e "PGAPPNAME=$contender_app" "$CONTAINER_NAME" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" >"$TEMP_DIR/$phase-contender.log" 2>&1 <<SQL &
BEGIN;
SET LOCAL lock_timeout = '10s'; SET LOCAL statement_timeout = '15s';
UPDATE public.$table SET state = 'left' WHERE $contender_where;
COMMIT;
SQL
  local contender_pid=$!; PIDS="$PIDS $contender_pid"
  wait_for_query "SELECT count(*) FROM pg_stat_activity c JOIN LATERAL unnest(pg_blocking_pids(c.pid)) blocker(pid) ON true JOIN pg_stat_activity h ON h.pid = blocker.pid AND h.application_name = '$holder_app' WHERE c.application_name = '$contender_app' AND c.wait_event_type = 'Lock' AND c.wait_event = 'advisory'" "$phase contender block"
  if ! wait "$holder_pid"; then sed -n '1,120p' "$TEMP_DIR/$phase-holder.log" >&2; fail "$phase holder failed"; fi
  if ! wait "$contender_pid"; then sed -n '1,120p' "$TEMP_DIR/$phase-contender.log" >&2; fail "$phase contender failed"; fi
}

run_overlap space space_members \
  "space_id = '30000000-0000-4000-8000-000000000001' AND user_id = '10000000-0000-4000-8000-000000000001'" \
  "space_id = '30000000-0000-4000-8000-000000000001' AND user_id = '10000000-0000-4000-8000-000000000002'"
run_overlap voyage voyage_members \
  "id = '40000000-0000-4000-8000-000000000001'" \
  "id = '40000000-0000-4000-8000-000000000002'"

run_label_overlap() {
  local phase="$1" holder_sql="$2" contender_sql="$3"
  docker exec -i -e "PGAPPNAME=label-$phase-holder" "$CONTAINER_NAME" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" >"$TEMP_DIR/label-$phase-holder.log" 2>&1 <<SQL &
BEGIN; $holder_sql; SELECT pg_sleep(4); COMMIT;
SQL
  local holder=$!; PIDS="$PIDS $holder"
  wait_for_query "SELECT count(*) FROM pg_stat_activity WHERE application_name='label-$phase-holder' AND wait_event='PgSleep'" "$phase label holder"
  docker exec -i -e "PGAPPNAME=label-$phase-contender" "$CONTAINER_NAME" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" >"$TEMP_DIR/label-$phase-contender.log" 2>&1 <<SQL &
BEGIN; $contender_sql; SELECT pg_sleep(2); COMMIT;
SQL
  local contender=$!; PIDS="$PIDS $contender"
  wait_for_query "SELECT (count(*)=2)::int FROM pg_stat_activity WHERE application_name IN ('label-$phase-holder','label-$phase-contender')" "$phase real overlap"
  wait "$holder" || fail "$phase label holder failed"
  wait "$contender" || fail "$phase label contender failed"
}
run_label_overlap profile "UPDATE profiles SET display_name='Cato Renamed' WHERE id='10000000-0000-4000-8000-000000000003'" \
  "UPDATE voyage_members SET state='left' WHERE id='40000000-0000-4000-8000-000000000003'; UPDATE voyage_members SET state='active' WHERE id='40000000-0000-4000-8000-000000000003'"
run_label_overlap voyage "UPDATE voyages SET name='Voyage Renamed' WHERE id='20000000-0000-4000-8000-000000000001'" \
  "UPDATE space_members SET state='left' WHERE user_id='10000000-0000-4000-8000-000000000003'; UPDATE space_members SET state='active' WHERE user_id='10000000-0000-4000-8000-000000000003'"

verdict="$(docker exec "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 -Atq \
  -U postgres -d "$DATABASE" -f "/workspace/$ASSERTIONS")"
[ "$verdict" = AUTHORITY_PROJECTION_CONCURRENCY_GREEN ] || fail 'exact green verdict missing'
printf '%s\n' "$verdict"
