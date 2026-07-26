#!/usr/bin/env bash
# C7 falsification — exactly-once INGRESS under real concurrency.
#
# The sibling recipe source-intent-exactly-once.sh proves the claim primitive.
# This one proves the whole thing C7 actually asserts: 25 identical concurrent
# requests yield exactly ONE event, ONE source audience, ONE graph fragment and
# ONE delivery set; the same key carrying a different payload fails and commits
# nothing; and an event written during the deployment gap is recovered.
#
# It runs the real cutover — every migration through 071 — against a disposable
# local PostgreSQL, so it exercises the same functions the dev branch carries.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/docker-proof.sh"
source "$SCRIPT_DIR/lib/installed-precondition.sh"
source "$SCRIPT_DIR/lib/private-voyager-response-proof.sh"
IMAGE=pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee
DATABASE=voyager_atomic_ingress
CONTAINER_NAME="voyager-atomic-ingress-$(date +%s)-$$"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-atomic-ingress.XXXXXX")"
MIGRATIONS=(supabase/migrations/054_active_membership_authority.sql
  supabase/migrations/055_active_knowledge_retrieval.sql
  supabase/migrations/056_room_invite_authority.sql
  supabase/migrations/057_room_invite_transition.sql
  supabase/migrations/058_private_reply_promotion_authority.sql
  supabase/migrations/059_session_authority_cleanup.sql
  supabase/migrations/060_source_intent.sql
  supabase/migrations/061_knowledge_graph_schema.sql
  supabase/migrations/062_knowledge_graph_authorization.sql
  supabase/migrations/063_knowledge_graph_retrieval.sql
  supabase/migrations/064_knowledge_graph_cutover.sql
  supabase/migrations/065_knowledge_graph_authority_projection.sql
  supabase/migrations/066_knowledge_graph_membership_projection.sql
  supabase/migrations/067_knowledge_graph_projection_activation.sql
  supabase/migrations/068_atomic_source_ingress.sql
  supabase/migrations/069_deployment_gap_recovery.sql
  supabase/migrations/070_private_voyager_response_ingress.sql
  supabase/migrations/071_voyager_response_gap_recovery.sql)
ACTOR='10000000-0000-4000-8000-0000000000c7'
OTHER='10000000-0000-4000-8000-0000000000c8'
VOYAGE='20000000-0000-4000-8000-0000000000c7'
SPACE='30000000-0000-4000-8000-0000000000c7'
SESSION='40000000-0000-4000-8000-0000000000c7'
CONCURRENCY=25
PIDS=''

fail() { printf 'atomic-ingress: %s\n' "$1" >&2; exit 1; }
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

# A two-person room, created AFTER the cutover so the projection triggers build
# its graph the way the live product now does.
psql_run -v ON_ERROR_STOP=1 <<SQL >/dev/null
INSERT INTO auth.users(id) VALUES ('$ACTOR'), ('$OTHER');
-- The installed baseline mints a profile from an auth.users insert, so name the
-- two people rather than assuming this recipe is what created them.
INSERT INTO public.profiles(id, display_name) VALUES
  ('$ACTOR', 'Actor'), ('$OTHER', 'Other')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;
INSERT INTO public.voyages(id, slug, name, created_by)
VALUES ('$VOYAGE', 'c7-voyage', 'C7 Voyage', '$ACTOR');
INSERT INTO public.voyage_members(voyage_id, user_id, role) VALUES
  ('$VOYAGE', '$ACTOR', 'captain'), ('$VOYAGE', '$OTHER', 'crew');
INSERT INTO public.spaces(id, voyage_id, created_by) VALUES ('$SPACE', '$VOYAGE', '$ACTOR');
INSERT INTO public.space_members(space_id, user_id, state) VALUES
  ('$SPACE', '$ACTOR', 'active'), ('$SPACE', '$OTHER', 'active');
INSERT INTO public.sessions(id, user_id, voyage_id, space_id, status)
VALUES ('$SESSION', '$ACTOR', '$VOYAGE', '$SPACE', 'active');
SQL

# One ingress attempt, exactly as the runtime performs it: one RPC that claims
# first and commits the audience, the event, its graph and its outbox together.
cat > "$TEMP_DIR/attempt.sql" <<'SQL'
\set ON_ERROR_STOP on
SELECT status FROM public.claim_source_message_ingress(
  :'actor', 'chat', :'key', :'space', 'c7-voyage', :'payload',
  'message', 'conversation', 'user',
  ARRAY[:'actor', :'other']::uuid[], ARRAY[:'other']::uuid[],
  jsonb_build_object('session_id', :'session', 'source', 'room'),
  jsonb_build_object('role', 'user'));
SQL

for ((worker = 0; worker < CONCURRENCY; worker++)); do
  docker exec -i "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" \
    -v actor="$ACTOR" -v other="$OTHER" -v space="$SPACE" -v session="$SESSION" \
    -v key='c7-client-message' -v payload='the one intended payload' \
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

# ONE event, ONE source audience, ONE node, ONE source grant, ONE authored_by,
# ONE posted_in and ONE delivery. Anything doubled fails here.
observed="$(psql_run -v ON_ERROR_STOP=1 -c "
  WITH ingress AS (
    SELECT event.id FROM public.knowledge_events event
    JOIN public.knowledge_source_intents intent ON intent.event_id = event.id),
  node AS (SELECT n.id FROM public.graph_nodes n JOIN ingress ON n.authority_id = ingress.id
    WHERE n.kind = 'message_event')
  SELECT (SELECT count(*) FROM ingress)::text || '/' ||
    (SELECT count(DISTINCT event.knowledge_audience_id) FROM public.knowledge_events event
      JOIN ingress ON ingress.id = event.id)::text || '/' ||
    (SELECT count(*) FROM node)::text || '/' ||
    (SELECT count(*) FROM public.graph_node_grants g JOIN node ON node.id = g.node_id)::text || '/' ||
    (SELECT count(*) FROM public.graph_edges e JOIN node ON node.id = e.source_node_id
      WHERE e.kind = 'authored_by')::text || '/' ||
    (SELECT count(*) FROM public.graph_edges e JOIN node ON node.id = e.source_node_id
      WHERE e.kind = 'posted_in')::text || '/' ||
    (SELECT count(*) FROM public.message_deliveries d JOIN ingress ON ingress.id = d.event_id)::text")"
[ "$observed" = '1/1/1/1/1/1/1' ] \
  || fail "expected one event/audience/node/grant/authored_by/posted_in/delivery; observed $observed"

# Same key, different payload: must fail, and must leave the winner untouched.
conflict="$(docker exec -i "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" \
  -v actor="$ACTOR" -v other="$OTHER" -v space="$SPACE" -v session="$SESSION" \
  -v key='c7-client-message' -v payload='a different payload' \
  -f - < "$TEMP_DIR/attempt.sql" 2>&1 || true)"
case "$conflict" in
  *source_intent_payload_conflict*) : ;;
  *) fail "same-key/different-payload was not rejected: $(printf '%s' "$conflict" | tr '\n' ' ')" ;;
esac
after="$(psql_run -v ON_ERROR_STOP=1 -c "
  SELECT (SELECT count(*) FROM public.knowledge_source_intents)::text || '/' ||
         (SELECT count(*) FROM public.knowledge_events)::text || '/' ||
         (SELECT count(*) FROM public.message_deliveries)::text")"
[ "$after" = '1/1/1' ] || fail "conflict left residue; observed $after"

prove_private_voyager_response "$ACTOR" "$SESSION"

# The deployment gap: an event the OLD ingress wrote after the cutover landed
# and before the new ingress went live. It has no audience, so nothing can see
# it, and recovery must give it the same shape a claimed ingress would have.
psql_run -v ON_ERROR_STOP=1 <<SQL >/dev/null
INSERT INTO public.knowledge_events(user_id, voyage_slug, event_type, content, metadata,
  source_type, source_ref, actor_id, actor_type, participants)
VALUES ('$ACTOR', 'c7-voyage', 'message', 'written during the deployment gap',
  jsonb_build_object('session_id', '$SESSION'), 'conversation',
  jsonb_build_object('role', 'user'), '$ACTOR', 'user', ARRAY['$ACTOR', '$OTHER']::uuid[]);
SQL
recovery="$(psql_run -v ON_ERROR_STOP=1 -c "
  SELECT recovered::text || '/' || rejected::text
  FROM public.recover_knowledge_graph_deployment_gap()")"
[ "$recovery" = '1/0' ] || fail "expected one recovered gap event and no rejection; observed $recovery"
gap="$(psql_run -v ON_ERROR_STOP=1 -c "
  WITH gap AS (SELECT id FROM public.knowledge_events
    WHERE content = 'written during the deployment gap')
  SELECT (SELECT count(*) FROM public.knowledge_events event JOIN gap ON gap.id = event.id
      WHERE event.knowledge_audience_id IS NOT NULL)::text || '/' ||
    (SELECT count(*) FROM public.graph_nodes n JOIN gap ON n.authority_id = gap.id
      WHERE n.kind = 'message_event')::text || '/' ||
    (SELECT count(*) FROM public.graph_edges e
      JOIN public.graph_nodes n ON n.id = e.source_node_id JOIN gap ON n.authority_id = gap.id
      WHERE e.kind IN ('authored_by', 'posted_in'))::text")"
[ "$gap" = '1/1/2' ] || fail "gap event was not fully recovered; observed $gap"
repeat="$(psql_run -v ON_ERROR_STOP=1 -c "
  SELECT recovered::text FROM public.recover_knowledge_graph_deployment_gap()")"
[ "$repeat" = '0' ] || fail "recovery is not idempotent; a rerun recovered $repeat"

# No live legacy graph survives the cutover.
residue="$(psql_run -v ON_ERROR_STOP=1 -c "
  SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'knowledge_edges')::text || '/' ||
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'graph_traverse')::text")"
[ "$residue" = '0/0' ] || fail "legacy graph residue remains; observed $residue"

printf 'atomic-ingress: %s concurrent identical requests | 1 created | %s replayed\n' \
  "$CONCURRENCY" "$replayed"
printf 'atomic-ingress: one event, audience, node, grant, structural pair and delivery\n'
printf 'atomic-ingress: same key + different payload rejected | no residue\n'
printf 'atomic-ingress: Voyager response inherited source audience | generated_by | no delivery | replayed once\n'
printf 'atomic-ingress: deployment-gap event recovered | rerun recovers nothing\n'
printf 'atomic-ingress: legacy table and traversal RPC both absent\n'
printf 'ATOMIC_INGRESS_EXACTLY_ONCE_GREEN\n'
