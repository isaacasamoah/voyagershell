#!/usr/bin/env bash
# Rollback-only knowledge-graph proof against Voyager's hosted PostgreSQL.
set -euo pipefail; set +x
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
source "$REPO_ROOT/recipes/lib/hosted-target.sh"
source "$REPO_ROOT/recipes/lib/installed-precondition.sh"
source "$REPO_ROOT/recipes/lib/knowledge-graph-transaction.sh"
hosted_target_require knowledge-graph || exit $?
hosted_confirmation_require knowledge-graph \
  VOYAGER_ALLOW_HOSTED_ROLLBACK || exit $?
PROOF_SQL="$REPO_ROOT/recipes/sql/knowledge-graph"
PRODUCT_MIGRATIONS=("$REPO_ROOT/supabase/migrations/054_active_membership_authority.sql"
  "$REPO_ROOT/supabase/migrations/055_active_knowledge_retrieval.sql"
  "$REPO_ROOT/supabase/migrations/056_room_invite_authority.sql"
  "$REPO_ROOT/supabase/migrations/057_room_invite_transition.sql"
  "$REPO_ROOT/supabase/migrations/058_private_reply_promotion_authority.sql"
  "$REPO_ROOT/supabase/migrations/059_session_authority_cleanup.sql")
MIGRATIONS=("$REPO_ROOT/supabase/migrations/061_knowledge_graph_schema.sql"
  "$REPO_ROOT/supabase/migrations/062_knowledge_graph_authorization.sql"
  "$REPO_ROOT/supabase/migrations/063_knowledge_graph_retrieval.sql")
CUTOVER="$REPO_ROOT/supabase/migrations/064_knowledge_graph_cutover.sql"
PROJECTIONS=("$REPO_ROOT/supabase/migrations/065_knowledge_graph_authority_projection.sql"
  "$REPO_ROOT/supabase/migrations/066_knowledge_graph_membership_projection.sql")
ACTIVATION="$REPO_ROOT/supabase/migrations/067_knowledge_graph_projection_activation.sql"
INGRESS=("$REPO_ROOT/supabase/migrations/068_atomic_source_ingress.sql"
  "$REPO_ROOT/supabase/migrations/069_deployment_gap_recovery.sql"
  "$REPO_ROOT/supabase/migrations/070_private_voyager_response_ingress.sql"
  "$REPO_ROOT/supabase/migrations/071_voyager_response_gap_recovery.sql")
CARTOGRAPHER="$REPO_ROOT/supabase/migrations/072_event_driven_cartographer.sql"
FIXTURE="$REPO_ROOT/lib/knowledge/kernel/fixtures/v1.json"
GENERATOR="$REPO_ROOT/lib/knowledge/kernel/generate-sql.ts"
K1_GENERATOR="$REPO_ROOT/lib/knowledge/kernel/generate-k1-sql.ts"
VITE_NODE="$REPO_ROOT/node_modules/.bin/vite-node"
TARGET_CATALOG="$PROOF_SQL/catalog-targets.sql"
FULL_CATALOG="$PROOF_SQL/catalog-full.sql"
INSTALLED_POSTCONDITION="$PROOF_SQL/../installed-post-059-contract.sql"
API_URL="https://api.supabase.com/v1/projects/$PROJECT_REF/database/query"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-knowledge-graph.XXXXXX")"
INSTALLED_PRECONDITION="$TEMP_DIR/installed-precondition.sql"
cleanup() {
  unset ACCESS_TOKEN VOYAGER_AUTHORIZED_SUPABASE_PROJECT_REF \
    VOYAGER_ALLOW_HOSTED_ROLLBACK VOYAGER_SUPABASE_ACCESS_TOKEN \
    VOYAGER_SUPABASE_PROJECT_REF
  rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
for command_name in curl jq; do
  command -v "$command_name" >/dev/null || {
    printf 'knowledge-graph: missing required command: %s\n' "$command_name" >&2
    exit 2
  }
done
for required_file in "${MIGRATIONS[@]}" "$CUTOVER" "${PROJECTIONS[@]}" "$ACTIVATION" "${INGRESS[@]}" "$CARTOGRAPHER" \
  "${PRODUCT_MIGRATIONS[@]}" "$TARGET_CATALOG" "$FULL_CATALOG" \
  "$INSTALLED_POSTCONDITION" "$FIXTURE" "$GENERATOR" "$K1_GENERATOR"; do
  [ -f "$required_file" ] || {
    printf 'knowledge-graph: missing file: %s\n' "$required_file" >&2
    exit 2
  }
done
installed_precondition_compose "$REPO_ROOT" > "$INSTALLED_PRECONDITION" || {
  printf 'knowledge-graph: could not compose installed precondition\n' >&2
  exit 2
}
[ -x "$VITE_NODE" ] || {
  printf 'knowledge-graph: dependencies missing; run npm ci first\n' >&2
  exit 2
}
hosted_access_token_require knowledge-graph || exit $?
printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$ACCESS_TOKEN" > "$TEMP_DIR/headers.txt"
chmod 600 "$TEMP_DIR/headers.txt"
unset ACCESS_TOKEN VOYAGER_AUTHORIZED_SUPABASE_PROJECT_REF \
  VOYAGER_ALLOW_HOSTED_ROLLBACK VOYAGER_SUPABASE_PROJECT_REF
query_api() {
  local sql_file="$1"
  local response_file="$2"
  local payload_file="$TEMP_DIR/request.json"
  jq -Rs '{query: .}' "$sql_file" > "$payload_file"
  if ! curl --disable --silent --show-error --fail-with-body \
    --connect-timeout 15 --max-time 180 \
    --request POST "$API_URL" \
    --header "@$TEMP_DIR/headers.txt" \
    --data-binary "@$payload_file" > "$response_file"; then
    printf 'knowledge-graph: Management API query failed\n' >&2
    return 1
  fi
}
query_api "$TARGET_CATALOG" "$TEMP_DIR/catalog-before.json"
jq --sort-keys '.' "$TEMP_DIR/catalog-before.json" > "$TEMP_DIR/catalog-before.sorted.json"
query_api "$FULL_CATALOG" "$TEMP_DIR/full-catalog-before.json"
jq --sort-keys '.' "$TEMP_DIR/full-catalog-before.json" > "$TEMP_DIR/full-catalog-before.sorted.json"
query_api "$INSTALLED_PRECONDITION" "$TEMP_DIR/precondition-response.json"
if ! jq -e '
    type == "array"
    and length == 1
    and .[0] == {
      "precondition_marker": "INSTALLED_PRE_054_PRECONDITION_GREEN"
    }
  ' "$TEMP_DIR/precondition-response.json" >/dev/null; then
  printf 'knowledge-graph: installed pre-054 precondition failed\n' >&2
  exit 3
fi
legacy_names='["knowledge_edges","idx_edges_source","idx_edges_target","idx_edges_type","graph_traverse"]'
new_count="$(jq --argjson legacy "$legacy_names" \
  '[.[] | select(.object_name as $name | ($legacy | index($name) | not))] | length' \
  "$TEMP_DIR/catalog-before.sorted.json")"
if [ "$new_count" -ne 0 ]; then
  printf 'knowledge-graph: new target catalogue objects already exist; refusing rollback proof\n' >&2
  jq -r --argjson legacy "$legacy_names" \
    '.[] | select(.object_name as $name | ($legacy | index($name) | not)) |
      "  \(.object_type):\(.object_name)"' "$TEMP_DIR/catalog-before.sorted.json" >&2
  exit 3
fi
"$VITE_NODE" "$GENERATOR" --output "$TEMP_DIR/generated-proof.sql"
"$VITE_NODE" "$K1_GENERATOR" \
  --legacy-output "$TEMP_DIR/k1-legacy.sql" \
  --historical-output "$TEMP_DIR/k1-historical.sql" \
  --gap-output "$TEMP_DIR/gap-setup.sql" \
  --assertions-output "$TEMP_DIR/k1-assertions.sql" \
  --boundary-output "$TEMP_DIR/boundary-assertions.sql"
if grep -Eq '^[[:space:]]*(BEGIN|COMMIT|ROLLBACK)[[:space:]]*;' \
  "${PRODUCT_MIGRATIONS[@]}" "${MIGRATIONS[@]}" "$CUTOVER" \
  "${PROJECTIONS[@]}" "$ACTIVATION" "${INGRESS[@]}" "$CARTOGRAPHER" "$TEMP_DIR/generated-proof.sql" "$TEMP_DIR/k1-legacy.sql" \
  "$TEMP_DIR/k1-historical.sql" \
  "$TEMP_DIR/gap-setup.sql" "$TEMP_DIR/k1-assertions.sql" \
  "$TEMP_DIR/boundary-assertions.sql"; then
  printf 'knowledge-graph: nested transaction command refused\n' >&2
  exit 3
fi
compose_knowledge_graph_transaction
query_api "$TEMP_DIR/transaction.sql" "$TEMP_DIR/transaction-response.json"
if ! jq -e '
    . == [
      {
        "postcondition_marker": "INSTALLED_POST_059_CONTRACT_GREEN"
      },
      {
        "verdict": "KNOWLEDGE_GRAPH_SQL_GREEN"
      }
    ]
  ' "$TEMP_DIR/transaction-response.json" >/dev/null; then
  printf 'knowledge-graph: transaction returned no exact green verdict\n' >&2
  exit 4
fi
query_api "$TARGET_CATALOG" "$TEMP_DIR/catalog-after.json"
jq --sort-keys '.' "$TEMP_DIR/catalog-after.json" > "$TEMP_DIR/catalog-after.sorted.json"
if ! cmp -s "$TEMP_DIR/catalog-before.sorted.json" "$TEMP_DIR/catalog-after.sorted.json"; then
  printf 'knowledge-graph: post-run catalogue residue differs from pre-run\n' >&2
  diff -u "$TEMP_DIR/catalog-before.sorted.json" "$TEMP_DIR/catalog-after.sorted.json" >&2 || true
  exit 5
fi
query_api "$FULL_CATALOG" "$TEMP_DIR/full-catalog-after.json"
jq --sort-keys '.' "$TEMP_DIR/full-catalog-after.json" > "$TEMP_DIR/full-catalog-after.sorted.json"
if ! cmp -s "$TEMP_DIR/full-catalog-before.sorted.json" "$TEMP_DIR/full-catalog-after.sorted.json"; then
  printf 'knowledge-graph: full public catalogue differs after rollback\n' >&2
  diff -u "$TEMP_DIR/full-catalog-before.sorted.json" "$TEMP_DIR/full-catalog-after.sorted.json" >&2 || true
  exit 6
fi
NODE_COUNT="$(jq -r '.expected.nodeCount' "$FIXTURE")"
EDGE_COUNT="$(jq -r '.expected.historicalEdgeCount' "$FIXTURE")"
SHARED_CLAIM="$(jq -r '.expected.sharedClaim' "$FIXTURE")"
printf 'knowledge-graph: existing knowledge_events ledger | 3 fixed sources | participants NULL\n'
printf 'knowledge-graph: 6 kinds | %s nodes | %s historical edges | replay identical\n' "$NODE_COUNT" "$EDGE_COUNT"
printf 'knowledge-graph: graph on found "%s" with immutable source; graph off missed it\n' "$SHARED_CLAIM"
printf 'knowledge-graph: 16 edge kinds | six-root DB RPC | metadata denied\n'
printf 'knowledge-graph: root denied | hidden bridge denied | timing class equal | victim private residue 0 | NULL denied\n'
printf 'knowledge-graph: NULL source excluded then assigned once | Person + Voyager rename stable | residue 0\n'
printf 'knowledge-graph: K1 exact backfill parity | unresolved rows outside graph and reported\n'
printf 'knowledge-graph: multi-scope identity | locked catch-up | leave/rejoin | cascade-safe history\n'
printf 'knowledge-graph: K3 owns graph commits | retrieval green | old writer absent | rollback identical\n'
printf 'KNOWLEDGE_GRAPH_POC_GREEN\n'
