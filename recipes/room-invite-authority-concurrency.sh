#!/usr/bin/env bash
# Disposable proof for atomic invite response/re-entry versus competing authority transitions.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/docker-proof.sh"
IMAGE=pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee
DATABASE=voyager_invite_authority
CONTAINER_NAME="voyager-invite-authority-$(date +%s)-$$"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-invite-authority.XXXXXX")"
SCHEMA_FILES=(supabase/migrations/054_active_membership_authority.sql
  supabase/migrations/056_room_invite_authority.sql
  supabase/migrations/057_room_invite_transition.sql)
PIDS=''

fail() { printf 'invite-authority: %s\n' "$1" >&2; exit 1; }
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
[ -f "$REPO_ROOT/$DOCKER_PROOF_PRE054_BASELINE" ] \
  || fail "missing baseline: $DOCKER_PROOF_PRE054_BASELINE"
installed_precondition_assert_fragments "$REPO_ROOT" \
  || fail 'precondition SQL fragments are incomplete'
for file in "${SCHEMA_FILES[@]}"; do [ -f "$REPO_ROOT/$file" ] || fail "missing SQL: $file"; done

docker_proof_run --detach --rm --pull=never --name "$CONTAINER_NAME" --network none \
  --volume "$REPO_ROOT:/workspace:ro" -e POSTGRES_DB="$DATABASE" \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE" >/dev/null
docker_proof_wait_ready "$CONTAINER_NAME" "$DATABASE" \
  || fail 'PostgreSQL readiness timeout'
docker_proof_install_pre054 "$CONTAINER_NAME" "$DATABASE" \
  || fail 'pre-054 installed-state baseline or contract failed'
for file in "${SCHEMA_FILES[@]}"; do
  docker exec "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 --single-transaction \
    -U postgres -d "$DATABASE" -f "/workspace/$file" >/dev/null
done

docker exec -i "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" <<'SQL'
INSERT INTO auth.users(id) VALUES
  ('10000000-0000-4000-8000-000000000031'), ('10000000-0000-4000-8000-000000000032');
UPDATE public.profiles SET
  display_name = CASE WHEN id = '10000000-0000-4000-8000-000000000031'
    THEN 'Inviter' ELSE 'Invitee' END,
  username = CASE WHEN id = '10000000-0000-4000-8000-000000000031'
    THEN 'inviter' ELSE 'invitee' END
WHERE id IN ('10000000-0000-4000-8000-000000000031',
  '10000000-0000-4000-8000-000000000032');
INSERT INTO public.voyages(id, slug, name) VALUES
  ('20000000-0000-4000-8000-000000000031', 'invite-voyage', 'Invite Voyage');
INSERT INTO public.voyage_members(id, voyage_id, user_id) VALUES
  ('40000000-0000-4000-8000-000000000031', '20000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000031'),
  ('40000000-0000-4000-8000-000000000032', '20000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000032');
INSERT INTO public.spaces(id, voyage_id) VALUES
  ('30000000-0000-4000-8000-000000000031', '20000000-0000-4000-8000-000000000031');
INSERT INTO public.space_members(space_id, user_id, state) VALUES
  ('30000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000031', 'active'),
  ('30000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000032', 'invited');
INSERT INTO public.sessions(id, user_id, status, voyage_id) VALUES
  ('50000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000032',
    'active', '20000000-0000-4000-8000-000000000031'),
  ('50000000-0000-4000-8000-000000000032', '10000000-0000-4000-8000-000000000031',
    'active', '20000000-0000-4000-8000-000000000031');
UPDATE public.sessions SET space_id='30000000-0000-4000-8000-000000000031'
WHERE id='50000000-0000-4000-8000-000000000032';
SQL
docker exec "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  -f /workspace/recipes/sql/room-invite-transition-assertions.sql >/dev/null

wait_for_block() {
  local app="$1"
  for ((attempt = 0; attempt < 80; attempt++)); do
    blocked="$(docker exec "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" -c \
      "SELECT count(*) FROM pg_stat_activity WHERE application_name='$app' AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0")"
    [ "$blocked" = 1 ] && return
    sleep 0.1
  done
  fail "$app did not block"
}
wait_for_sleep() {
  local app="$1"
  for ((attempt = 0; attempt < 80; attempt++)); do
    sleeping="$(docker exec "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" -c \
      "SELECT count(*) FROM pg_stat_activity WHERE application_name='$app' AND wait_event='PgSleep'")"
    [ "$sleeping" = 1 ] && return
    sleep 0.1
  done
  fail "$app did not hold its transaction"
}
run_transition() {
  local app="$1" action="$2" log="$3" sleep_for="$4"
  docker exec -i -e PGAPPNAME="$app" "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
    -U postgres -d "$DATABASE" >"$log" 2>&1 <<SQL &
BEGIN;
SET LOCAL statement_timeout='15s'; SET LOCAL ROLE service_role;
SELECT transition_status FROM public.transition_room_invite(
  '50000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000032',
  '30000000-0000-4000-8000-000000000031', '$action');
SELECT pg_sleep($sleep_for);
COMMIT;
SQL
  LAST_PID=$!; PIDS="$PIDS $LAST_PID"
}
run_invite() {
  local app="$1" log="$2" sleep_for="$3"
  docker exec -i -e PGAPPNAME="$app" "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
    -U postgres -d "$DATABASE" >"$log" 2>&1 <<SQL &
BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL ROLE service_role;
SELECT invite_status FROM public.create_room_invite(
 '50000000-0000-4000-8000-000000000032','10000000-0000-4000-8000-000000000031',
 '10000000-0000-4000-8000-000000000032');
SELECT pg_sleep($sleep_for); COMMIT;
SQL
  LAST_PID=$!; PIDS="$PIDS $LAST_PID"
}
reset_creation() {
  docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" >/dev/null <<'SQL'
UPDATE voyage_members SET state='active' WHERE id='40000000-0000-4000-8000-000000000031';
UPDATE space_members SET state=CASE WHEN user_id='10000000-0000-4000-8000-000000000031'
  THEN 'active' ELSE 'left' END WHERE space_id='30000000-0000-4000-8000-000000000031';
SQL
}
reset_invite() {
  docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" >/dev/null <<'SQL'
UPDATE public.voyage_members SET state='active' WHERE id='40000000-0000-4000-8000-000000000032';
UPDATE public.space_members SET state='invited' WHERE space_id='30000000-0000-4000-8000-000000000031'
  AND user_id='10000000-0000-4000-8000-000000000032';
UPDATE public.sessions SET space_id=NULL WHERE id='50000000-0000-4000-8000-000000000031';
SQL
}
assert_state() {
  local expected_member="$1" expected_link="$2" label="$3" observed
  observed="$(docker exec "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" -c \
    "SELECT ((SELECT state='$expected_member' FROM space_members WHERE user_id='10000000-0000-4000-8000-000000000032') AND ((SELECT space_id FROM sessions WHERE id='50000000-0000-4000-8000-000000000031') IS $expected_link))::int")"
  [ "$observed" = 1 ] || fail "$label state mismatch"
}

# Accept commits first; decline waits and observes no pending invite.
run_transition accept-first accept "$TEMP_DIR/accept-first.log" 3; accept_pid=$LAST_PID
wait_for_sleep accept-first
run_transition decline-second decline "$TEMP_DIR/decline-second.log" 0; decline_pid=$LAST_PID
wait_for_block decline-second
wait "$accept_pid" || fail 'accept-first failed'; wait "$decline_pid" || fail 'decline-second failed'
grep -qx accepted "$TEMP_DIR/accept-first.log" || fail 'accept-first verdict'
grep -qx no_pending_invite "$TEMP_DIR/decline-second.log" || fail 'decline-second verdict'
assert_state active 'NOT NULL' accept-first

# Decline commits first; accept waits and cannot return success.
reset_invite
run_transition decline-first decline "$TEMP_DIR/decline-first.log" 3; decline_pid=$LAST_PID
wait_for_sleep decline-first
run_transition accept-second accept "$TEMP_DIR/accept-second.log" 0; accept_pid=$LAST_PID
wait_for_block accept-second
wait "$decline_pid" || fail 'decline-first failed'; wait "$accept_pid" || fail 'accept-second failed'
grep -qx declined "$TEMP_DIR/decline-first.log" || fail 'decline-first verdict'
grep -qx no_pending_invite "$TEMP_DIR/accept-second.log" || fail 'accept-second verdict'
assert_state left NULL decline-first

# Accept may commit before parent leave; the later leave atomically deactivates the room row.
reset_invite
run_transition accept-before-leave accept "$TEMP_DIR/accept-before-leave.log" 3; accept_pid=$LAST_PID
wait_for_sleep accept-before-leave
docker exec -i -e PGAPPNAME=leave-after-accept "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >"$TEMP_DIR/leave-after.log" 2>&1 <<'SQL' &
UPDATE public.voyage_members SET state='left' WHERE id='40000000-0000-4000-8000-000000000032';
SQL
leave_pid=$!; PIDS="$PIDS $leave_pid"; wait_for_block leave-after-accept
wait "$accept_pid" || fail 'accept-before-leave failed'; wait "$leave_pid" || fail 'leave-after-accept failed'
grep -qx accepted "$TEMP_DIR/accept-before-leave.log" || fail 'accept-before-leave verdict'
assert_state left 'NOT NULL' accept-before-leave

# Parent leave commits first; the waiting accept returns denied and never links the session.
reset_invite
docker exec -i -e PGAPPNAME=leave-first "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >"$TEMP_DIR/leave-first.log" 2>&1 <<'SQL' &
BEGIN; SET LOCAL statement_timeout='15s';
UPDATE public.voyage_members SET state='left' WHERE id='40000000-0000-4000-8000-000000000032';
SELECT pg_sleep(3); COMMIT;
SQL
leave_pid=$!; PIDS="$PIDS $leave_pid"; wait_for_sleep leave-first
run_transition accept-after-leave accept "$TEMP_DIR/accept-after-leave.log" 0; accept_pid=$LAST_PID
wait_for_block accept-after-leave
wait "$leave_pid" || fail 'leave-first failed'; wait "$accept_pid" || fail 'accept-after-leave failed'
grep -qx denied "$TEMP_DIR/accept-after-leave.log" || fail 'accept-after-leave verdict'
assert_state left NULL leave-first

# Re-entry uses the same function and effective-authority checks.
reset_invite
docker exec "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  -c "UPDATE space_members SET state='active' WHERE user_id='10000000-0000-4000-8000-000000000032'" >/dev/null
reentry="$(docker exec "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" -c \
  "SET ROLE service_role; SELECT transition_status FROM public.transition_room_invite('50000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000032','30000000-0000-4000-8000-000000000031','accept')")"
[ "$reentry" = entered ] || fail 're-entry verdict'
assert_state active 'NOT NULL' reentry

# Invite commits first; parent leave waits, then removes only the inviter's current authority.
reset_creation
run_invite invite-before-leave "$TEMP_DIR/invite-before-leave.log" 3; invite_pid=$LAST_PID
wait_for_sleep invite-before-leave
docker exec -i -e PGAPPNAME=leave-after-invite "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" -c "UPDATE voyage_members SET state='left' WHERE id='40000000-0000-4000-8000-000000000031'" &
leave_pid=$!; PIDS="$PIDS $leave_pid"; wait_for_block leave-after-invite
wait "$invite_pid" || fail 'invite-before-leave failed'; wait "$leave_pid" || fail 'leave-after-invite failed'
grep -qx invited "$TEMP_DIR/invite-before-leave.log" || fail 'invite-before-leave verdict'

# Parent leave commits first; the waiting invite observes revocation and leaves the invitee left.
reset_creation
docker exec -i -e PGAPPNAME=leave-before-invite "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >"$TEMP_DIR/leave-before-invite.log" 2>&1 <<'SQL' &
BEGIN; UPDATE voyage_members SET state='left' WHERE id='40000000-0000-4000-8000-000000000031';
SELECT pg_sleep(3); COMMIT;
SQL
leave_pid=$!; PIDS="$PIDS $leave_pid"; wait_for_sleep leave-before-invite
run_invite invite-after-leave "$TEMP_DIR/invite-after-leave.log" 0; invite_pid=$LAST_PID
wait_for_block invite-after-leave
wait "$leave_pid" || fail 'leave-before-invite failed'; wait "$invite_pid" || fail 'invite-after-leave failed'
grep -qx denied "$TEMP_DIR/invite-after-leave.log" || fail 'invite-after-leave verdict'
zero="$(docker exec "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" -c \
 "SET ROLE service_role; SELECT invite_status FROM create_room_invite(gen_random_uuid(),'10000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000032')")"
[ "$zero" = denied ] || fail 'missing-session invite did not fail closed'
final="$(docker exec "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" -c \
 "SELECT count(*) FROM space_members WHERE user_id='10000000-0000-4000-8000-000000000032' AND state='left'")"
[ "$final" = 1 ] || fail 'denied invite changed membership'
printf '%s\n' ROOM_INVITE_AUTHORITY_CONCURRENCY_GREEN
