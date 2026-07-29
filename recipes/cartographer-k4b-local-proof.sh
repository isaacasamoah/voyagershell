#!/usr/bin/env bash
# K4b topic/backfill proof in one disposable, no-network PostgreSQL container.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/docker-proof.sh"
IMAGE=pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee
DATABASE=voyager_cartographer_k4b
CONTAINER_NAME="voyager-cartographer-k4b-$(date +%s)-$$"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-cartographer-k4b.XXXXXX")"
VITE_NODE="$REPO_ROOT/node_modules/.bin/vite-node"
PIDS=""
fail() { printf 'cartographer-k4b-local: %s\n' "$1" >&2; exit 1; }
cleanup() { docker_proof_cleanup "$CONTAINER_NAME" "$PIDS"; rm -rf -- "$TEMP_DIR"; }
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
docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/supabase/migrations/073_graph_memory_read.sql" >/dev/null \
  || fail 'migration 073 failed'
cat > "$TEMP_DIR/denial.sql" <<'SQL'
\set ON_ERROR_STOP off
SET ROLE authenticated;
SELECT count(*) FROM public.knowledge_topics;
SELECT count(*) FROM public.knowledge_topic_backfill_outcomes;
SELECT public.activate_knowledge_topic_contract();
SELECT * FROM public.find_knowledge_topic_candidates(
  '72000000-0000-4000-8000-000000000001', array_fill(0::real, ARRAY[1536])::vector);
RESET ROLE;
SQL
docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/supabase/migrations/074_topic_nodes.sql" >/dev/null \
  || fail 'candidate migration failed'
docker exec -i "$CONTAINER_NAME" psql -X -q -U postgres -d "$DATABASE" \
  < "$TEMP_DIR/denial.sql" > "$TEMP_DIR/denial.txt" 2>&1
[ "$(rg -c 'permission denied' "$TEMP_DIR/denial.txt")" = 4 ] \
  || fail 'new authority surfaces were not denied to authenticated'

audience_id="$(docker exec "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" -c "SELECT id FROM public.knowledge_audiences
  WHERE purpose='source' AND member_profile_ids =
    ARRAY['72000000-0000-4000-8000-000000000001']::uuid[] ORDER BY created_at LIMIT 1")"
cat > "$TEMP_DIR/enqueue-first.sql" <<SQL
BEGIN;
INSERT INTO public.knowledge_events(id,event_type,content,actor_id,actor_type,
  knowledge_audience_id,metadata) VALUES
('78000000-0000-4000-8000-000000000001','message','enqueue first',
 '72000000-0000-4000-8000-000000000001','user','$audience_id','{}');
SELECT pg_sleep(3);
COMMIT;
SQL
docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" < "$TEMP_DIR/enqueue-first.sql" &
enqueue_holder=$!
sleep 0.4
docker exec "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" -c 'SELECT public.activate_knowledge_topic_contract()' \
  > "$TEMP_DIR/activate-enqueue-first.out" &
activation_waiter=$!
sleep 0.4
kill -0 "$activation_waiter" 2>/dev/null || fail 'enqueue-first activation did not wait'
wait "$enqueue_holder" || fail 'enqueue-first transaction failed'
wait "$activation_waiter" || fail 'enqueue-first activation failed'
[ "$(docker exec "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" -c \
  "SELECT extractor_version FROM public.knowledge_extraction_jobs
   WHERE source_event_id='78000000-0000-4000-8000-000000000001'")" \
  = cartographer-single-claim-v2 ] || fail 'enqueue-first did not stamp v2 before activation'

docker exec "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  -c "UPDATE public.knowledge_extractor_contract_active SET
    extractor_version='cartographer-single-claim-v2', activated_at=clock_timestamp()" >/dev/null
cat > "$TEMP_DIR/activation-first.sql" <<'SQL'
BEGIN;
SELECT public.activate_knowledge_topic_contract();
SELECT pg_sleep(3);
COMMIT;
SQL
docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" < "$TEMP_DIR/activation-first.sql" &
activation_holder=$!
sleep 0.4
docker exec "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" -c \
  "INSERT INTO public.knowledge_events(id,event_type,content,actor_id,actor_type,
   knowledge_audience_id,metadata) VALUES
   ('78000000-0000-4000-8000-000000000002','message','activation first',
    '72000000-0000-4000-8000-000000000001','user','$audience_id','{}')" &
enqueue_waiter=$!
sleep 0.4
kill -0 "$enqueue_waiter" 2>/dev/null || fail 'activation-first enqueue did not wait'
wait "$activation_holder" || fail 'activation-first activation failed'
wait "$enqueue_waiter" || fail 'activation-first enqueue failed'
[ "$(docker exec "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" -c \
  "SELECT extractor_version FROM public.knowledge_extraction_jobs
   WHERE source_event_id='78000000-0000-4000-8000-000000000002'")" \
  = cartographer-single-claim-v3 ] || fail 'activation-first enqueue did not resume on v3'

docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" \
  < "$REPO_ROOT/recipes/sql/cartographer-k4b-assertions.sql" >/dev/null \
  || fail 'sequential topic/backfill assertions failed'
docker exec "$CONTAINER_NAME" psql -X -Atq -F '|' \
  -v ON_ERROR_STOP=1 -U postgres -d "$DATABASE" -c \
  "SELECT attempt_id,lease_token,label,claim,vector_index FROM public.k4b_prepare_race()" \
  > "$TEMP_DIR/race-rows"
[ "$(wc -l < "$TEMP_DIR/race-rows" | tr -d ' ')" = 2 ] \
  || fail 'topic race did not prepare two attempts'
cat > "$TEMP_DIR/topic-lock-holder.sql" <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(861319074);
SELECT pg_sleep(3);
COMMIT;
SQL
docker exec -i "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" < "$TEMP_DIR/topic-lock-holder.sql" &
lock_holder=$!
sleep 0.4
for index in 1 2; do
  row="$(sed -n "${index}p" "$TEMP_DIR/race-rows")"
  IFS='|' read -r attempt token label claim vector_index <<ROW
$row
ROW
  docker exec "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
    -U postgres -d "$DATABASE" -c \
    "SELECT outcome FROM public.complete_knowledge_extraction_attempt(
      '$attempt','$token','succeeded',
      jsonb_build_object('claim','$claim','aboutPersonId',NULL,'knowledgeType','domain',
        'attentionScore',0.8,'contextSnippet','$claim','topics',jsonb_build_array('$label')),
      '$claim',NULL,'domain',0.8,public.k4b_vector($vector_index),jsonb_build_array(
        jsonb_build_object('label','$label','embedding',public.k4b_vector($vector_index)::text)),
      NULL,10,5)" > "$TEMP_DIR/race-$index.out" &
  PIDS="$PIDS $!"
done
sleep 0.5
waiters="$(docker exec "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()
   AND wait_event_type='Lock' AND query LIKE 'SELECT outcome FROM public.complete_%'")"
[ "$waiters" = 2 ] || fail 'paraphrase commits were not concurrently blocked at the mint lock'
wait "$lock_holder" || fail 'topic lock holder failed'
for pid in $PIDS; do wait "$pid" || fail 'concurrent paraphrase completion failed'; done
PIDS=""
[ "$(docker exec "$CONTAINER_NAME" psql -X -Atq -U postgres -d "$DATABASE" -c \
  "SELECT count(*) FROM public.knowledge_topics WHERE normalized_label IN
    ('orbital ceramics','spacecraft ceramic shields')")" = 1 ] \
  || fail 'concurrent paraphrases minted sibling topics'
verdict="$(docker exec "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" -c 'SELECT public.k4b_final_assertions()')"
[ "$verdict" = CARTOGRAPHER_K4B_ASSERTIONS_GREEN ] \
  || fail 'exact K4b assertion verdict missing'
printf '%s\n' CARTOGRAPHER_K4B_LOCAL_GREEN
