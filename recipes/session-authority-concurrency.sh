#!/usr/bin/env bash
# Real session invariant and membership-authority overlap proof.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/docker-proof.sh"
IMAGE=pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee
DATABASE=voyager_session_authority
CONTAINER_NAME="voyager-session-authority-$(date +%s)-$$"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-session-authority.XXXXXX")"
MIGRATIONS=(supabase/migrations/054_active_membership_authority.sql
  supabase/migrations/059_session_authority_cleanup.sql)
PIDS=''
fail() { printf 'session-authority: %s\n' "$1" >&2; exit 1; }
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
installed_precondition_assert_fragments "$REPO_ROOT" \
  || fail 'precondition SQL fragments are incomplete'
for file in "${MIGRATIONS[@]}"; do
  [ -f "$REPO_ROOT/$file" ] || fail "missing migration: $file"
done
docker_proof_run --detach --rm --pull=never --name "$CONTAINER_NAME" --network none \
  --volume "$REPO_ROOT:/workspace:ro" -e POSTGRES_DB="$DATABASE" \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE" >/dev/null
docker_proof_wait_ready "$CONTAINER_NAME" "$DATABASE" \
  || fail 'PostgreSQL readiness timeout'
docker_proof_install_pre054 "$CONTAINER_NAME" "$DATABASE" \
  || fail 'pre-054 installed-state baseline or contract failed'
for file in "${MIGRATIONS[@]}"; do
  docker exec "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
    --single-transaction -U postgres -d "$DATABASE" -f "/workspace/$file"
done
docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" <<'SQL'
INSERT INTO auth.users(id) VALUES ('10000000-0000-4000-8000-000000000071');
INSERT INTO public.voyages(id, slug, name) VALUES
  ('20000000-0000-4000-8000-000000000071', 'session-concurrency', 'Session Concurrency');
INSERT INTO public.voyage_members(id, voyage_id, user_id) VALUES
  ('40000000-0000-4000-8000-000000000071',
   '20000000-0000-4000-8000-000000000071',
   '10000000-0000-4000-8000-000000000071');
INSERT INTO public.spaces(id, voyage_id) VALUES
  ('30000000-0000-4000-8000-000000000071',
   '20000000-0000-4000-8000-000000000071');
INSERT INTO public.space_members(space_id, user_id) VALUES
  ('30000000-0000-4000-8000-000000000071',
   '10000000-0000-4000-8000-000000000071');
INSERT INTO public.sessions(id, user_id, voyage_id, space_id, status) VALUES
  ('50000000-0000-4000-8000-000000000071',
   '10000000-0000-4000-8000-000000000071',
   '20000000-0000-4000-8000-000000000071',
   '30000000-0000-4000-8000-000000000071', 'active'),
  ('50000000-0000-4000-8000-000000000072',
   '10000000-0000-4000-8000-000000000071',
   '20000000-0000-4000-8000-000000000071',
   '30000000-0000-4000-8000-000000000071', 'historical'),
  ('50000000-0000-4000-8000-000000000073',
   '10000000-0000-4000-8000-000000000071',
   '20000000-0000-4000-8000-000000000071',
   '30000000-0000-4000-8000-000000000071', 'historical');
SQL

wait_for_query() {
  local sql="$1" label="$2" observed
  for ((attempt = 0; attempt < 80; attempt++)); do
    observed="$(docker exec "$CONTAINER_NAME" psql -X -Atq -U postgres \
      -d "$DATABASE" -c "$sql")" || fail "$label observer failed"
    [ "$observed" = 1 ] && return
    sleep 0.1
  done
  fail "$label timeout"
}

reset_active() {
  docker exec "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 -U postgres \
    -d "$DATABASE" -c "UPDATE sessions SET status='historical';
      UPDATE sessions SET status='active' WHERE id='$1';"
}

lifecycle_overlap() {
  local holder_app="$1" holder_sql="$2" holder_id="$3"
  local contender_app="$4" contender_sql="$5" contender_id="$6" final_id="$7"
  docker exec -e PGAPPNAME="$holder_app" "$CONTAINER_NAME" psql -X -Atq \
    -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
    -c "BEGIN; SET LOCAL ROLE service_role; $holder_sql; SELECT pg_sleep(3); COMMIT;" \
    >"$TEMP_DIR/$holder_app.log" 2>&1 &
  local holder_pid=$!; PIDS="$PIDS $holder_pid"
  wait_for_query "SELECT count(*) FROM pg_stat_activity WHERE
    application_name='$holder_app' AND wait_event='PgSleep'" "$holder_app holder"
  docker exec -e PGAPPNAME="$contender_app" "$CONTAINER_NAME" psql -X -Atq \
    -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
    -c "SET ROLE service_role; $contender_sql" >"$TEMP_DIR/$contender_app.log" 2>&1 &
  local contender_pid=$!; PIDS="$PIDS $contender_pid"
  wait_for_query "SELECT count(*) FROM pg_stat_activity c
    JOIN pg_stat_activity h ON h.pid=ANY(pg_blocking_pids(c.pid))
    WHERE c.application_name='$contender_app' AND h.application_name='$holder_app'
      AND c.wait_event_type='Lock'" "$contender_app serialized"
  wait "$holder_pid" || fail "$holder_app failed"
  wait "$contender_pid" || fail "$contender_app failed"
  grep -Fq "$holder_id" "$TEMP_DIR/$holder_app.log" || fail "$holder_app returned wrong session"
  grep -Fq "$contender_id" "$TEMP_DIR/$contender_app.log" || fail "$contender_app returned wrong session"
  wait_for_query "SELECT ((count(*) FILTER (WHERE status='active')=1)
    AND bool_and(id='$final_id') FILTER (WHERE status='active'))::int FROM sessions" \
    "$contender_app final active session"
}

# An admitted room mutation keeps its effective-membership lock until commit.
docker exec -i -e PGAPPNAME=room-rpc-first "$CONTAINER_NAME" \
  psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  >"$TEMP_DIR/rpc-first.log" 2>&1 <<'SQL' &
BEGIN; SET LOCAL ROLE service_role;
SELECT public.set_session_ai_presence(
  '50000000-0000-4000-8000-000000000071',
  '10000000-0000-4000-8000-000000000071', false);
SELECT pg_sleep(3); COMMIT;
SQL
rpc_pid=$!; PIDS="$PIDS $rpc_pid"
wait_for_query \
  "SELECT count(*) FROM pg_stat_activity WHERE application_name='room-rpc-first'
   AND wait_event='PgSleep'" 'RPC-first holder'
docker exec -i -e PGAPPNAME=space-leave-second "$CONTAINER_NAME" \
  psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  >"$TEMP_DIR/space-leave-second.log" 2>&1 <<'SQL' &
UPDATE public.space_members SET state='left'
WHERE space_id='30000000-0000-4000-8000-000000000071'
  AND user_id='10000000-0000-4000-8000-000000000071';
SQL
leave_pid=$!; PIDS="$PIDS $leave_pid"
wait_for_query \
  "SELECT count(*) FROM pg_stat_activity c
   JOIN pg_stat_activity h ON h.pid=ANY(pg_blocking_pids(c.pid))
   WHERE c.application_name='space-leave-second'
     AND h.application_name='room-rpc-first' AND c.wait_event_type='Lock'" \
  'space leave blocked behind room RPC'
wait "$rpc_pid" || fail 'RPC-first holder failed'
wait "$leave_pid" || fail 'space-leave contender failed'
grep -qx t "$TEMP_DIR/rpc-first.log" || fail 'RPC-first did not commit'

# A committed space revocation makes the waiting session mutation fail closed.
docker exec "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" -c \
  "UPDATE space_members SET state='active'
   WHERE space_id='30000000-0000-4000-8000-000000000071'
     AND user_id='10000000-0000-4000-8000-000000000071';
   UPDATE spaces SET ai_present=true WHERE id='30000000-0000-4000-8000-000000000071';"
before="$(docker exec "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" -c \
  "SELECT ai_present FROM spaces WHERE id='30000000-0000-4000-8000-000000000071'")"
docker exec -i -e PGAPPNAME=space-leave-first "$CONTAINER_NAME" \
  psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  >"$TEMP_DIR/space-leave-first.log" 2>&1 <<'SQL' &
BEGIN;
UPDATE public.space_members SET state='left'
WHERE space_id='30000000-0000-4000-8000-000000000071'
  AND user_id='10000000-0000-4000-8000-000000000071';
SELECT pg_sleep(3); COMMIT;
SQL
space_pid=$!; PIDS="$PIDS $space_pid"
wait_for_query \
  "SELECT count(*) FROM pg_stat_activity WHERE application_name='space-leave-first'
   AND wait_event='PgSleep'" 'space-leave holder'
docker exec -i -e PGAPPNAME=session-rpc-second "$CONTAINER_NAME" \
  psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  >"$TEMP_DIR/rpc-second.log" 2>&1 <<'SQL' &
SET ROLE service_role;
SELECT public.set_session_ai_presence(
  '50000000-0000-4000-8000-000000000071',
  '10000000-0000-4000-8000-000000000071', false);
SQL
second_pid=$!; PIDS="$PIDS $second_pid"
wait_for_query \
  "SELECT count(*) FROM pg_stat_activity c
   JOIN pg_stat_activity h ON h.pid=ANY(pg_blocking_pids(c.pid))
   WHERE c.application_name='session-rpc-second'
     AND h.application_name='space-leave-first' AND c.wait_event_type='Lock'" \
  'session RPC blocked behind space leave'
wait "$space_pid" || fail 'space-leave holder failed'
if wait "$second_pid"; then fail 'session RPC accepted committed space revocation'; fi
grep -Fq session_access_denied "$TEMP_DIR/rpc-second.log" \
  || fail 'session RPC rejection was not exact'
after="$(docker exec "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" -c \
  "SELECT ai_present FROM spaces WHERE id='30000000-0000-4000-8000-000000000071'")"
[ "$after" = "$before" ] || fail 'denied room RPC changed AI presence'

user_id=10000000-0000-4000-8000-000000000071
session_a=50000000-0000-4000-8000-000000000072
session_b=50000000-0000-4000-8000-000000000073
resume_a="SELECT id FROM public.resume_session('$session_a','$user_id')"
resume_b="SELECT id FROM public.resume_session('$session_b','$user_id')"
get_active="SELECT id FROM public.get_or_create_active_session('$user_id','session-concurrency')"

reset_active 50000000-0000-4000-8000-000000000071
lifecycle_overlap resume-a-first "$resume_a" "$session_a" \
  resume-b-second "$resume_b" "$session_b" "$session_b"
reset_active 50000000-0000-4000-8000-000000000071
lifecycle_overlap resume-b-first "$resume_b" "$session_b" \
  resume-a-second "$resume_a" "$session_a" "$session_a"
reset_active 50000000-0000-4000-8000-000000000071
lifecycle_overlap resume-first "$resume_a" "$session_a" \
  get-second "$get_active" "$session_a" "$session_a"
reset_active 50000000-0000-4000-8000-000000000071
lifecycle_overlap get-first "$get_active" 50000000-0000-4000-8000-000000000071 \
  resume-second "$resume_a" "$session_a" "$session_a"

printf '%s\n' SESSION_AUTHORITY_CONCURRENCY_GREEN
