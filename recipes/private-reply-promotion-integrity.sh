#!/usr/bin/env bash
# Disposable mismatch, privilege, FK, and deletion-order proof for private reply promotion.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/docker-proof.sh"
IMAGE=pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee
DATABASE=voyager_promotion_integrity
CONTAINER_NAME="voyager-promotion-integrity-$(date +%s)-$$"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-promotion-integrity.XXXXXX")"
PIDS=''
fail() { printf 'promotion-integrity: %s\n' "$1" >&2; exit 1; }
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
docker_proof_run --detach --rm --pull=never --name "$CONTAINER_NAME" --network none \
  --volume "$REPO_ROOT:/workspace:ro" -e POSTGRES_DB="$DATABASE" \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE" >/dev/null
docker_proof_wait_ready "$CONTAINER_NAME" "$DATABASE" \
  || fail 'PostgreSQL readiness timeout'

# PROOF_PHASE: PRE_BOUNDARY_FIXTURE
docker_proof_install_pre054 "$CONTAINER_NAME" "$DATABASE" \
  || fail 'pre-054 installed-state baseline or contract failed'

# PROOF_PHASE: LEGACY_BAD_POINTER_SEED
# Existing bad pointers are deliberately seeded before the new boundary is installed.
docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" <<'SQL'
INSERT INTO auth.users(id) VALUES
 ('10000000-0000-4000-8000-000000000041'), ('10000000-0000-4000-8000-000000000042');
UPDATE profiles SET display_name=CASE WHEN id::text LIKE '%41' THEN 'Publisher' ELSE 'Recipient' END;
INSERT INTO voyages(id,slug,name) VALUES
 ('20000000-0000-4000-8000-000000000041','integrity-a','Voyage A'),
 ('20000000-0000-4000-8000-000000000042','integrity-b','Voyage B');
INSERT INTO voyage_members(id,voyage_id,user_id) VALUES
 ('40000000-0000-4000-8000-000000000041','20000000-0000-4000-8000-000000000041','10000000-0000-4000-8000-000000000041'),
 ('40000000-0000-4000-8000-000000000042','20000000-0000-4000-8000-000000000041','10000000-0000-4000-8000-000000000042'),
 ('40000000-0000-4000-8000-000000000043','20000000-0000-4000-8000-000000000042','10000000-0000-4000-8000-000000000041');
INSERT INTO spaces(id,voyage_id) VALUES
 ('30000000-0000-4000-8000-000000000041','20000000-0000-4000-8000-000000000041'),
 ('30000000-0000-4000-8000-000000000042','20000000-0000-4000-8000-000000000042'),
 ('30000000-0000-4000-8000-000000000043',NULL),
 ('30000000-0000-4000-8000-000000000044','20000000-0000-4000-8000-000000000041'),
 ('30000000-0000-4000-8000-000000000045','20000000-0000-4000-8000-000000000041');
INSERT INTO space_members(space_id,user_id) SELECT space_id,user_id FROM (VALUES
 ('30000000-0000-4000-8000-000000000041'::uuid,'10000000-0000-4000-8000-000000000041'::uuid),
 ('30000000-0000-4000-8000-000000000042','10000000-0000-4000-8000-000000000041'),
 ('30000000-0000-4000-8000-000000000044','10000000-0000-4000-8000-000000000041'),
 ('30000000-0000-4000-8000-000000000044','10000000-0000-4000-8000-000000000042'),
 ('30000000-0000-4000-8000-000000000045','10000000-0000-4000-8000-000000000041'),
 ('30000000-0000-4000-8000-000000000045','10000000-0000-4000-8000-000000000042')) row(space_id,user_id);
INSERT INTO sessions(id,user_id,voyage_id,space_id) VALUES
 ('50000000-0000-4000-8000-000000000041','10000000-0000-4000-8000-000000000041','20000000-0000-4000-8000-000000000041','30000000-0000-4000-8000-000000000042'),
 ('50000000-0000-4000-8000-000000000042','10000000-0000-4000-8000-000000000041',NULL,'30000000-0000-4000-8000-000000000041'),
 ('50000000-0000-4000-8000-000000000043','10000000-0000-4000-8000-000000000041','20000000-0000-4000-8000-000000000041','30000000-0000-4000-8000-000000000043'),
 ('50000000-0000-4000-8000-000000000044','10000000-0000-4000-8000-000000000041','20000000-0000-4000-8000-000000000041','30000000-0000-4000-8000-000000000044'),
 ('50000000-0000-4000-8000-000000000045','10000000-0000-4000-8000-000000000041','20000000-0000-4000-8000-000000000041','30000000-0000-4000-8000-000000000045'),
 ('50000000-0000-4000-8000-000000000046','10000000-0000-4000-8000-000000000041',NULL,NULL);
INSERT INTO knowledge_events(id,user_id,voyage_slug,event_type,content,metadata,source_type,
 source_ref,actor_type,participants,sequence_num) SELECT id,'10000000-0000-4000-8000-000000000041',slug,
 'conversation',content,jsonb_build_object('session_id',session_id),'conversation',
 jsonb_build_object('conversation_id',session_id,'role','assistant'),'voyager',
 ARRAY['10000000-0000-4000-8000-000000000041'::uuid],seq FROM (VALUES
 ('61000000-0000-4000-8000-000000000041'::uuid,'integrity-a','cross mismatch','50000000-0000-4000-8000-000000000041',-319421),
 ('61000000-0000-4000-8000-000000000042','', 'null parent mismatch','50000000-0000-4000-8000-000000000042',-319422),
 ('61000000-0000-4000-8000-000000000043','integrity-a','standalone mismatch','50000000-0000-4000-8000-000000000043',-319423),
 ('61000000-0000-4000-8000-000000000044','integrity-a','publication first','50000000-0000-4000-8000-000000000044',-319424),
 ('61000000-0000-4000-8000-000000000045','integrity-a','deletion first','50000000-0000-4000-8000-000000000045',-319425)
 ) source(id,slug,content,session_id,seq);
UPDATE knowledge_events SET voyage_slug=NULL WHERE id='61000000-0000-4000-8000-000000000042';
GRANT SELECT,INSERT,UPDATE ON sessions TO authenticated;
SQL

# PROOF_PHASE: INSTALL_AUTHORITY_BOUNDARY_054
docker exec "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 --single-transaction \
  -U postgres -d "$DATABASE" -f /workspace/supabase/migrations/054_active_membership_authority.sql

# PROOF_PHASE: INSTALL_PRIVATE_REPLY_PROMOTION_058
docker exec "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 --single-transaction \
  -U postgres -d "$DATABASE" -f /workspace/supabase/migrations/058_private_reply_promotion_authority.sql

# PROOF_PHASE: POST_BOUNDARY_ASSERTIONS
docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" <<'SQL'
DO $guard$
BEGIN
  BEGIN
    INSERT INTO sessions(id,user_id,voyage_id,space_id) VALUES
      ('50000000-0000-4000-8000-000000000048','10000000-0000-4000-8000-000000000041',
       '20000000-0000-4000-8000-000000000041','30000000-0000-4000-8000-000000000042');
    RAISE EXCEPTION 'post_boundary_mismatch_insert_accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'session_space_voyage_mismatch' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE sessions SET voyage_id='20000000-0000-4000-8000-000000000041',
      space_id='30000000-0000-4000-8000-000000000042'
    WHERE id='50000000-0000-4000-8000-000000000046';
    RAISE EXCEPTION 'post_boundary_mismatch_update_accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'session_space_voyage_mismatch' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM sessions WHERE id='50000000-0000-4000-8000-000000000048')
      OR EXISTS (SELECT 1 FROM sessions
        WHERE id='50000000-0000-4000-8000-000000000046'
          AND (voyage_id IS NOT NULL OR space_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'post_boundary_guard_side_effect';
  END IF;
END $guard$;

DO $proof$
DECLARE item record;
BEGIN
  IF (SELECT count(*) FROM pg_constraint WHERE
      (conname='private_reply_promotions_source_event_id_fkey' AND confdeltype='r') OR
      (conname='private_reply_promotions_sharer_user_id_fkey' AND confdeltype='c') OR
      (conname='private_reply_promotions_destination_space_id_fkey' AND confdeltype='c') OR
      (conname='private_reply_promotions_shared_event_fkey' AND confdeltype='r')) <> 4
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='private_reply_promotions_shared_event_fkey'
      AND confdeltype='r' AND condeferrable AND condeferred) THEN
    RAISE EXCEPTION 'promotion_fk_shape_mismatch'; END IF;
  BEGIN PERFORM currval(pg_get_serial_sequence('knowledge_events','sequence_num')::regclass);
    RAISE EXCEPTION 'sequence_already_initialized'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  FOR item IN SELECT * FROM (VALUES
    ('61000000-0000-4000-8000-000000000041'::uuid,'50000000-0000-4000-8000-000000000041'::uuid),
    ('61000000-0000-4000-8000-000000000042','50000000-0000-4000-8000-000000000042'),
    ('61000000-0000-4000-8000-000000000043','50000000-0000-4000-8000-000000000043')) x(event_id,session_id)
  LOOP BEGIN PERFORM public.promote_private_voyager_reply(item.event_id,item.session_id,
      '10000000-0000-4000-8000-000000000041'); RAISE EXCEPTION 'mismatch_promoted';
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM <> 'share_session_access_denied' THEN RAISE; END IF; END; END LOOP;
  BEGIN PERFORM currval(pg_get_serial_sequence('knowledge_events','sequence_num')::regclass);
    RAISE EXCEPTION 'mismatch_advanced_sequence'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  IF (SELECT count(*) FROM knowledge_events)<>5 OR EXISTS (SELECT 1 FROM private_reply_promotions)
    OR EXISTS (SELECT 1 FROM message_deliveries) THEN RAISE EXCEPTION 'mismatch_side_effect'; END IF;
END $proof$;
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000041'; SET ROLE authenticated;
DO $direct$ BEGIN
  BEGIN INSERT INTO sessions(id,user_id,voyage_id,space_id) VALUES
    ('50000000-0000-4000-8000-000000000047','10000000-0000-4000-8000-000000000041',
     '20000000-0000-4000-8000-000000000041','30000000-0000-4000-8000-000000000041');
    RAISE EXCEPTION 'direct_authority_insert_accepted'; EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM <> 'session_authority_columns_server_only' THEN RAISE; END IF; END;
  BEGIN UPDATE sessions SET voyage_id='20000000-0000-4000-8000-000000000041'
    WHERE id='50000000-0000-4000-8000-000000000046';
    RAISE EXCEPTION 'direct_authority_update_accepted'; EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM <> 'session_authority_columns_server_only' THEN RAISE; END IF; END;
END $direct$; RESET ROLE;
SQL

wait_for() {
  local app="$1" state="$2"
  for ((attempt = 0; attempt < 80; attempt++)); do
    observed="$(docker exec "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" -c \
      "SELECT count(*) FROM pg_stat_activity WHERE application_name='$app' AND $state")"
    [ "$observed" = 1 ] && return; sleep 0.1
  done
  fail "$app did not overlap"
}
docker exec -i -e PGAPPNAME=promotion-before-delete "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >"$TEMP_DIR/promote.log" 2>&1 <<'SQL' &
BEGIN; SET LOCAL ROLE service_role; SELECT * FROM promote_private_voyager_reply(
 '61000000-0000-4000-8000-000000000044','50000000-0000-4000-8000-000000000044',
 '10000000-0000-4000-8000-000000000041'); SELECT pg_sleep(3); COMMIT;
SQL
p1=$!; PIDS="$PIDS $p1"; wait_for promotion-before-delete "wait_event='PgSleep'"
docker exec -i -e PGAPPNAME=delete-after-promotion "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" -c "DELETE FROM spaces WHERE id='30000000-0000-4000-8000-000000000044'" &
p2=$!; PIDS="$PIDS $p2"; wait_for delete-after-promotion "wait_event_type='Lock'"
wait "$p1" || fail 'promotion-first failed'; wait "$p2" || fail 'delete-after failed'
docker exec -i -e PGAPPNAME=delete-before-promotion "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >"$TEMP_DIR/delete.log" 2>&1 <<'SQL' &
BEGIN; DELETE FROM spaces WHERE id='30000000-0000-4000-8000-000000000045';
SELECT pg_sleep(3); COMMIT;
SQL
p3=$!; PIDS="$PIDS $p3"; wait_for delete-before-promotion "wait_event='PgSleep'"
docker exec -i -e PGAPPNAME=promotion-after-delete "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" >"$TEMP_DIR/denied.log" 2>&1 <<'SQL' &
SET ROLE service_role;
DO $denial$
BEGIN
  BEGIN
    PERFORM promote_private_voyager_reply(
      '61000000-0000-4000-8000-000000000045','50000000-0000-4000-8000-000000000045',
      '10000000-0000-4000-8000-000000000041');
    RAISE EXCEPTION 'post_delete_promotion_committed';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'share_session_access_denied' THEN RAISE; END IF;
  END;
END $denial$;
SQL
p4=$!; PIDS="$PIDS $p4"; wait_for promotion-after-delete "wait_event_type='Lock'"
wait "$p3" || fail 'delete-first failed'
wait "$p4" || fail 'post-delete promotion denial failed'
verdict="$(docker exec "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" -c \
 "SELECT 'PRIVATE_REPLY_PROMOTION_INTEGRITY_GREEN' WHERE (SELECT count(*) FROM knowledge_events)=6
 AND (SELECT count(*) FROM message_deliveries)=1 AND NOT EXISTS (SELECT 1 FROM private_reply_promotions)
 AND (SELECT count(*) FROM sessions WHERE id IN ('50000000-0000-4000-8000-000000000044','50000000-0000-4000-8000-000000000045') AND space_id IS NULL)=2")"
[ "$verdict" = PRIVATE_REPLY_PROMOTION_INTEGRITY_GREEN ] || fail 'exact green verdict missing'
printf '%s\n' "$verdict"
