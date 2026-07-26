#!/usr/bin/env bash
# C7 falsification — exactly-once source intent under real concurrency.
# 25 identical concurrent requests must yield exactly one claim and one event;
# the same key carrying a different payload must fail and commit nothing.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/docker-proof.sh"
source "$SCRIPT_DIR/lib/installed-precondition.sh"
IMAGE=pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee
DATABASE=voyager_source_intent
CONTAINER_NAME="voyager-source-intent-$(date +%s)-$$"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-source-intent.XXXXXX")"
MIGRATIONS=(supabase/migrations/054_active_membership_authority.sql
  supabase/migrations/060_source_intent.sql)
ACTOR='10000000-0000-4000-8000-0000000000c7'
CONCURRENCY=25
PIDS=''

fail() { printf 'source-intent: %s\n' "$1" >&2; exit 1; }
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

psql_run() {
  docker exec -i "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" "$@"
}

# Supabase grants service_role full privileges on public ledger tables by
# default (verified: knowledge_events carries service_role=arwdDxtm on the live
# database); RLS, not the grant, is the gate. The shared pre-054 baseline
# under-models that and gives service_role no INSERT, so this recipe states the
# real grant locally rather than proving ingress against privileges the product
# does not actually run under. Correcting the shared baseline is a separate,
# deliberate change — it moves the security posture every recipe asserts.
psql_run -v ON_ERROR_STOP=1 <<SQL >/dev/null
INSERT INTO auth.users(id) VALUES ('$ACTOR');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.knowledge_events_sequence_num_seq TO service_role;
SQL

# One ingress attempt, exactly as the runtime performs it: claim first, and
# write the event ONLY when this caller is the claim winner. Every worker mints
# its own candidate event id, so a second event would be plainly visible.
cat > "$TEMP_DIR/attempt.sql" <<'SQL'
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE service_role;
CREATE TEMP TABLE attempt ON COMMIT DROP AS
SELECT * FROM public.claim_source_intent(
  :'actor', 'chat', :'key',
  public.canonical_source_payload_hash('chat', 'space-c7', :'payload'),
  gen_random_uuid());
INSERT INTO public.knowledge_events (id, user_id, event_type, content, actor_id, actor_type)
SELECT attempt.event_id, :'actor', 'message', :'payload', :'actor', 'user'
FROM attempt WHERE attempt.status = 'created';
SELECT status FROM attempt;
COMMIT;
SQL

for ((worker = 0; worker < CONCURRENCY; worker++)); do
  docker exec -i "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" \
    -v actor="$ACTOR" -v key='c7-client-message' -v payload='the one intended payload' \
    -f - < "$TEMP_DIR/attempt.sql" >"$TEMP_DIR/worker-$worker.log" 2>&1 &
  PIDS="$PIDS $!"
done
wait

created=0
replayed=0
for ((worker = 0; worker < CONCURRENCY; worker++)); do
  log="$TEMP_DIR/worker-$worker.log"
  if grep -qx 'created' "$log"; then
    created=$((created + 1))
  elif grep -qx 'replayed' "$log"; then
    replayed=$((replayed + 1))
  else
    fail "worker $worker neither created nor replayed: $(tr '\n' ' ' < "$log")"
  fi
done
[ "$created" -eq 1 ] || fail "expected exactly 1 winner, observed $created"
[ "$((created + replayed))" -eq "$CONCURRENCY" ] \
  || fail "expected $CONCURRENCY settled attempts, observed $((created + replayed))"

observed="$(psql_run -v ON_ERROR_STOP=1 -c "
  SELECT (SELECT count(*) FROM public.knowledge_source_intents)::text || '/' ||
         (SELECT count(*) FROM public.knowledge_events)::text || '/' ||
         (SELECT count(*) FROM public.knowledge_events event
            JOIN public.knowledge_source_intents intent ON intent.event_id = event.id)::text")"
[ "$observed" = '1/1/1' ] \
  || fail "expected one intent, one event and one binding; observed $observed"

# Same key, different payload: must fail, and must leave the winner untouched.
conflict="$(docker exec -i "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" \
  -v actor="$ACTOR" -v key='c7-client-message' -v payload='a different payload' \
  -f - < "$TEMP_DIR/attempt.sql" 2>&1 || true)"
case "$conflict" in
  *source_intent_payload_conflict*) : ;;
  *) fail "same-key/different-payload was not rejected: $(printf '%s' "$conflict" | tr '\n' ' ')" ;;
esac

after="$(psql_run -v ON_ERROR_STOP=1 -c "
  SELECT (SELECT count(*) FROM public.knowledge_source_intents)::text || '/' ||
         (SELECT count(*) FROM public.knowledge_events)::text")"
[ "$after" = '1/1' ] || fail "conflict left residue; observed $after"

# A replay must return the winner's event id, never mint a second one.
replay="$(docker exec -i "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" \
  -v actor="$ACTOR" -v key='c7-client-message' -v payload='the one intended payload' \
  -f - < "$TEMP_DIR/attempt.sql" 2>&1)"
grep -qx 'replayed' <<<"$replay" || fail "identical retry did not replay: $replay"
final="$(psql_run -v ON_ERROR_STOP=1 -c "
  SELECT (SELECT count(*) FROM public.knowledge_source_intents)::text || '/' ||
         (SELECT count(*) FROM public.knowledge_events)::text")"
[ "$final" = '1/1' ] || fail "replay created residue; observed $final"

printf 'source-intent: %s concurrent identical requests | 1 created | %s replayed\n' \
  "$CONCURRENCY" "$replayed"
printf 'source-intent: same key + different payload rejected | no residue\n'
printf 'SOURCE_INTENT_EXACTLY_ONCE_GREEN\n'
