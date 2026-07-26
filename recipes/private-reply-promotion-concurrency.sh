#!/usr/bin/env bash
# Disposable row-lock proof for publication versus membership revocation.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/docker-proof.sh"
IMAGE=pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee
DATABASE=voyager_promotion
CONTAINER_NAME="voyager-promotion-concurrency-$(date +%s)-$$"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-promotion.XXXXXX")"
MIGRATIONS=(supabase/migrations/054_active_membership_authority.sql
  supabase/migrations/058_private_reply_promotion_authority.sql)
PIDS=''

fail() { printf 'promotion-concurrency: %s\n' "$1" >&2; exit 1; }
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
for file in "${MIGRATIONS[@]}"; do [ -f "$REPO_ROOT/$file" ] || fail "missing SQL: $file"; done
docker_proof_run --detach --rm --pull=never --name "$CONTAINER_NAME" --network none \
  --volume "$REPO_ROOT:/workspace:ro" -e POSTGRES_DB="$DATABASE" \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE" >/dev/null
docker_proof_wait_ready "$CONTAINER_NAME" "$DATABASE" \
  || fail 'PostgreSQL readiness timeout'
docker_proof_install_pre054 "$CONTAINER_NAME" "$DATABASE" \
  || fail 'pre-054 installed-state baseline or contract failed'
for file in "${MIGRATIONS[@]}"; do
  docker exec "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 --single-transaction \
    -U postgres -d "$DATABASE" -f "/workspace/$file" >/dev/null
done

docker exec "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  -f /workspace/recipes/sql/private-reply-promotion-concurrency-seed.sql

wait_for() {
  local query="$1" label="$2" observed=0
  for ((attempt = 0; attempt < 60; attempt++)); do
    observed="$(docker exec "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" -c "$query")"
    [ "$observed" = 1 ] && return
    sleep 0.1
  done
  fail "$label timeout"
}

require_one() {
  local label="$1" query="$2" observed
  observed="$(docker exec "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
    -U postgres -d "$DATABASE" -c "$query")"
  if [ "$observed" != 1 ]; then
    docker exec "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" -c "SELECT jsonb_build_object('events',(SELECT jsonb_agg(jsonb_build_array(event_type,participants) ORDER BY id) FROM knowledge_events),'deliveries',(SELECT jsonb_agg(recipient_user_id ORDER BY recipient_user_id) FROM message_deliveries),'voyage_members',(SELECT jsonb_agg(jsonb_build_array(user_id,state,revision) ORDER BY user_id) FROM voyage_members),'space_members',(SELECT jsonb_agg(jsonb_build_array(user_id,state,revision) ORDER BY user_id) FROM space_members))" >&2
    fail "$label"
  fi
}

state_fingerprint() { docker exec "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" -c "SELECT md5(jsonb_build_object('events',(SELECT jsonb_agg(to_jsonb(row_value) ORDER BY id) FROM knowledge_events row_value),'promotions',(SELECT jsonb_agg(to_jsonb(row_value) ORDER BY source_event_id) FROM private_reply_promotions row_value),'deliveries',(SELECT jsonb_agg(to_jsonb(row_value) ORDER BY id) FROM message_deliveries row_value),'embedding_state',(SELECT jsonb_agg(to_jsonb(row_value) ORDER BY event_id) FROM knowledge_current row_value))::text)"; }
reactivate_publisher() {
  docker exec -i "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 \
    -U postgres -d "$DATABASE" >/dev/null <<'SQL'
BEGIN;
UPDATE public.voyage_members SET state='active'
  WHERE id='40000000-0000-4000-8000-000000000021';
UPDATE public.space_members SET state='active'
  WHERE space_id='30000000-0000-4000-8000-000000000021'
    AND user_id='10000000-0000-4000-8000-000000000021';
COMMIT;
SQL
}

docker exec -i -e PGAPPNAME=pre-snapshot-source-gate "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >"$TEMP_DIR/source-gate.log" 2>&1 <<'SQL' &
BEGIN;
SELECT id FROM public.knowledge_events
WHERE id='61000000-0000-4000-8000-000000000021' FOR UPDATE;
SELECT pg_sleep(4);
COMMIT;
SQL
source_gate=$!; PIDS="$PIDS $source_gate"
wait_for "SELECT count(*) FROM pg_stat_activity WHERE application_name='pre-snapshot-source-gate' AND wait_event='PgSleep'" 'source gate holder'
docker exec -i -e PGAPPNAME=publication-first "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >"$TEMP_DIR/publication.log" 2>&1 <<'SQL' &
BEGIN;
SET LOCAL statement_timeout='15s';
SET LOCAL ROLE service_role;
SELECT * FROM public.promote_private_voyager_reply('61000000-0000-4000-8000-000000000021',
  '50000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000021');
SELECT pg_sleep(4);
COMMIT;
SQL
publisher=$!; PIDS="$PIDS $publisher"
wait_for "SELECT count(*) FROM pg_stat_activity c JOIN pg_stat_activity h ON h.pid=ANY(pg_blocking_pids(c.pid)) WHERE c.application_name='publication-first' AND h.application_name='pre-snapshot-source-gate' AND c.wait_event_type='Lock'" 'publication preliminary authorization passed'
docker exec -e PGAPPNAME=invite-activation-between "$CONTAINER_NAME" psql -X -q \
  -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" -c "UPDATE public.space_members
  SET state='active' WHERE space_id='30000000-0000-4000-8000-000000000021'
  AND user_id='10000000-0000-4000-8000-000000000023';"
wait "$source_gate" || fail 'source snapshot gate failed'
wait_for "SELECT count(*) FROM pg_stat_activity WHERE application_name='publication-first' AND wait_event='PgSleep'" 'publication holder'
docker exec -i -e PGAPPNAME=late-recipient-revocation "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >"$TEMP_DIR/late-revocation.log" 2>&1 <<'SQL' &
UPDATE public.voyage_members SET state='left' WHERE id='40000000-0000-4000-8000-000000000023';
SQL
late_revoker=$!; PIDS="$PIDS $late_revoker"
wait_for "SELECT count(*) FROM pg_stat_activity WHERE application_name='late-recipient-revocation' AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0" 'late recipient revocation waiter'
docker exec -i -e PGAPPNAME=revocation-second "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >"$TEMP_DIR/revocation.log" 2>&1 <<'SQL' &
SET statement_timeout='15s';
UPDATE public.voyage_members SET state='left' WHERE id='40000000-0000-4000-8000-000000000021';
SQL
revoker=$!; PIDS="$PIDS $revoker"
wait_for "SELECT count(*) FROM pg_stat_activity WHERE application_name='revocation-second' AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0" 'revocation waiter'
wait "$publisher" || fail 'valid publication failed'
wait "$late_revoker" || fail 'waiting late recipient revocation failed'
wait "$revoker" || fail 'waiting revocation failed'
require_one 'publication-first state/count mismatch' "SELECT (
  (SELECT count(*) FROM knowledge_events WHERE user_id='10000000-0000-4000-8000-000000000021')=4 AND
  (SELECT count(*) FROM private_reply_promotions WHERE sharer_user_id='10000000-0000-4000-8000-000000000021')=1 AND
  (SELECT count(*) FROM message_deliveries delivery JOIN private_reply_promotions promotion ON promotion.shared_event_id=delivery.event_id WHERE promotion.sharer_user_id='10000000-0000-4000-8000-000000000021')=2 AND
  (SELECT participants=ARRAY['10000000-0000-4000-8000-000000000021'::uuid,'10000000-0000-4000-8000-000000000022'::uuid,'10000000-0000-4000-8000-000000000023'::uuid] FROM knowledge_events WHERE user_id='10000000-0000-4000-8000-000000000021' AND event_type='message') AND
  (SELECT state='left' AND revision=2 FROM voyage_members WHERE id='40000000-0000-4000-8000-000000000023') AND
  (SELECT state='left' AND revision=3 FROM space_members WHERE user_id='10000000-0000-4000-8000-000000000023') AND
  (SELECT state='left' AND revision=2 FROM voyage_members WHERE id='40000000-0000-4000-8000-000000000021') AND
  (SELECT state='left' AND revision=2 FROM space_members WHERE user_id='10000000-0000-4000-8000-000000000021'))::int"

reactivate_publisher
docker exec -i -e PGAPPNAME=revocation-first "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >"$TEMP_DIR/revocation-first.log" 2>&1 <<'SQL' &
BEGIN;
SET LOCAL statement_timeout='15s';
UPDATE public.voyage_members SET state='left' WHERE id='40000000-0000-4000-8000-000000000021';
SELECT pg_sleep(4);
COMMIT;
SQL
revoker_first=$!; PIDS="$PIDS $revoker_first"
wait_for "SELECT count(*) FROM pg_stat_activity WHERE application_name='revocation-first' AND wait_event='PgSleep'" 'revocation holder'
docker exec -i -e PGAPPNAME=publication-second "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >"$TEMP_DIR/denied.log" 2>&1 <<'SQL' &
SET statement_timeout='15s';
SET ROLE service_role;
SELECT * FROM public.promote_private_voyager_reply('61000000-0000-4000-8000-000000000022',
  '50000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000021');
SQL
denied=$!; PIDS="$PIDS $denied"
wait_for "SELECT count(*) FROM pg_stat_activity WHERE application_name='publication-second' AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0" 'denied publication waiter'
wait "$revoker_first" || fail 'first revocation failed'
if wait "$denied"; then fail 'post-revocation publication committed'; fi
require_one 'parent-revocation state/count mismatch' "SELECT (
  (SELECT count(*) FROM knowledge_events WHERE user_id='10000000-0000-4000-8000-000000000021')=4 AND
  (SELECT count(*) FROM private_reply_promotions WHERE sharer_user_id='10000000-0000-4000-8000-000000000021')=1 AND
  (SELECT count(*) FROM message_deliveries delivery JOIN private_reply_promotions promotion ON promotion.shared_event_id=delivery.event_id WHERE promotion.sharer_user_id='10000000-0000-4000-8000-000000000021')=2 AND
  (SELECT count(*) FROM private_reply_promotions WHERE source_event_id='61000000-0000-4000-8000-000000000022')=0 AND
  (SELECT state='left' AND revision=4 FROM voyage_members WHERE id='40000000-0000-4000-8000-000000000021') AND
  (SELECT state='left' AND revision=4 FROM space_members WHERE user_id='10000000-0000-4000-8000-000000000021'))::int"

reactivate_publisher
docker exec -i -e PGAPPNAME=room-revocation-first "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >"$TEMP_DIR/room-revocation.log" 2>&1 <<'SQL' &
BEGIN;
SET LOCAL statement_timeout='15s';
UPDATE public.space_members SET state='left'
  WHERE space_id='30000000-0000-4000-8000-000000000021'
    AND user_id='10000000-0000-4000-8000-000000000021';
SELECT pg_sleep(4);
COMMIT;
SQL
room_revoker=$!; PIDS="$PIDS $room_revoker"
wait_for "SELECT count(*) FROM pg_stat_activity WHERE application_name='room-revocation-first' AND wait_event='PgSleep'" 'room revocation holder'
docker exec -i -e PGAPPNAME=publication-third "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >"$TEMP_DIR/room-denied.log" 2>&1 <<'SQL' &
SET statement_timeout='15s';
SET ROLE service_role;
SELECT * FROM public.promote_private_voyager_reply('61000000-0000-4000-8000-000000000023',
  '50000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000021');
SQL
room_denied=$!; PIDS="$PIDS $room_denied"
wait_for "SELECT count(*) FROM pg_stat_activity WHERE application_name='publication-third' AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0" 'room-denied publication waiter'
wait "$room_revoker" || fail 'room revocation failed'
if wait "$room_denied"; then fail 'post-room-revocation publication committed'; fi
require_one 'room-revocation state/count mismatch' "SELECT (
  (SELECT count(*) FROM knowledge_events WHERE user_id='10000000-0000-4000-8000-000000000021')=4 AND
  (SELECT count(*) FROM private_reply_promotions WHERE sharer_user_id='10000000-0000-4000-8000-000000000021')=1 AND
  (SELECT count(*) FROM message_deliveries delivery JOIN private_reply_promotions promotion ON promotion.shared_event_id=delivery.event_id WHERE promotion.sharer_user_id='10000000-0000-4000-8000-000000000021')=2 AND
  (SELECT count(*) FROM private_reply_promotions WHERE source_event_id='61000000-0000-4000-8000-000000000023')=0 AND
  (SELECT state='active' AND revision=5 FROM voyage_members WHERE id='40000000-0000-4000-8000-000000000021') AND
  (SELECT state='left' AND revision=6 FROM space_members WHERE user_id='10000000-0000-4000-8000-000000000021'))::int"

replay_before="$(state_fingerprint)"
docker exec -i -e PGAPPNAME=revoked-replay "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" <<'SQL'
SET ROLE service_role;
DO $denial$ BEGIN
  BEGIN PERFORM public.promote_private_voyager_reply('61000000-0000-4000-8000-000000000021',
    '50000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000021');
    RAISE EXCEPTION 'post_room_revocation_replay_committed';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'share_not_active_in_room' THEN RAISE; END IF;
  END;
END $denial$;
SQL
replay_after="$(state_fingerprint)"
[ "$replay_after" = "$replay_before" ] || fail 'revoked replay changed publication or embedding state'

verdict="$(docker exec "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" -c \
  "SELECT 'PRIVATE_REPLY_PROMOTION_CONCURRENCY_GREEN' WHERE
    (SELECT count(*) FROM knowledge_events WHERE user_id='10000000-0000-4000-8000-000000000021')=4 AND
    (SELECT count(*) FROM knowledge_events WHERE user_id='10000000-0000-4000-8000-000000000021' AND event_type='conversation')=3 AND
    (SELECT count(*) FROM knowledge_events WHERE user_id='10000000-0000-4000-8000-000000000021' AND event_type='message')=1 AND
    (SELECT count(*) FROM private_reply_promotions WHERE sharer_user_id='10000000-0000-4000-8000-000000000021')=1 AND
    (SELECT count(*) FROM private_reply_promotions WHERE source_event_id='61000000-0000-4000-8000-000000000021')=1 AND
    (SELECT count(*) FROM private_reply_promotions WHERE source_event_id='61000000-0000-4000-8000-000000000022')=0 AND
    (SELECT count(*) FROM private_reply_promotions WHERE source_event_id='61000000-0000-4000-8000-000000000023')=0 AND
    (SELECT count(*) FROM message_deliveries delivery JOIN private_reply_promotions promotion ON promotion.shared_event_id=delivery.event_id WHERE promotion.sharer_user_id='10000000-0000-4000-8000-000000000021')=2 AND
    (SELECT count(*) FROM voyage_members WHERE voyage_id='20000000-0000-4000-8000-000000000021')=3 AND
    (SELECT count(*) FROM space_members WHERE space_id='30000000-0000-4000-8000-000000000021')=3 AND
    (SELECT state='active' AND revision=5 FROM voyage_members WHERE id='40000000-0000-4000-8000-000000000021') AND
    (SELECT state='left' AND revision=6 FROM space_members WHERE user_id='10000000-0000-4000-8000-000000000021') AND
    (SELECT state='active' AND revision=1 FROM voyage_members WHERE id='40000000-0000-4000-8000-000000000022') AND
    (SELECT state='active' AND revision=1 FROM space_members WHERE user_id='10000000-0000-4000-8000-000000000022') AND
    (SELECT state='left' AND revision=2 FROM voyage_members WHERE id='40000000-0000-4000-8000-000000000023') AND
    (SELECT state='left' AND revision=3 FROM space_members WHERE user_id='10000000-0000-4000-8000-000000000023') AND
    EXISTS (SELECT 1 FROM message_deliveries delivery JOIN private_reply_promotions promotion
      ON promotion.shared_event_id=delivery.event_id
      WHERE delivery.recipient_user_id='10000000-0000-4000-8000-000000000022') AND
    EXISTS (SELECT 1 FROM message_deliveries delivery JOIN private_reply_promotions promotion
      ON promotion.shared_event_id=delivery.event_id
      WHERE delivery.recipient_user_id='10000000-0000-4000-8000-000000000023')")"
[ "$verdict" = PRIVATE_REPLY_PROMOTION_CONCURRENCY_GREEN ] || fail 'exact green verdict missing'
printf '%s\n' "$verdict"
