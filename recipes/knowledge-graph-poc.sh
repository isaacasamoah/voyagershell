#!/usr/bin/env bash
# Rollback-only knowledge-graph proof against Voyager's hosted PostgreSQL.
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS=(
  "$REPO_ROOT/supabase/migrations/054_knowledge_graph_schema.sql"
  "$REPO_ROOT/supabase/migrations/055_knowledge_graph_authorization.sql"
)
FIXTURE="$REPO_ROOT/lib/knowledge/kernel/fixtures/v1.json"
GENERATOR="$REPO_ROOT/lib/knowledge/kernel/generate-sql.ts"
VITE_NODE="$REPO_ROOT/node_modules/.bin/vite-node"
PROJECT_REF="iesprdzzgjypnksoljym"
API_URL="https://api.supabase.com/v1/projects/$PROJECT_REF/database/query"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-knowledge-graph.XXXXXX")"

cleanup() {
  unset ACCESS_TOKEN
  rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT

for command_name in curl jq; do
  command -v "$command_name" >/dev/null || {
    printf 'knowledge-graph: missing required command: %s\n' "$command_name" >&2
    exit 2
  }
done
for required_file in "${MIGRATIONS[@]}" "$FIXTURE" "$GENERATOR"; do
  [ -f "$required_file" ] || {
    printf 'knowledge-graph: missing file: %s\n' "$required_file" >&2
    exit 2
  }
done
[ -x "$VITE_NODE" ] || {
  printf 'knowledge-graph: dependencies missing; run npm ci first\n' >&2
  exit 2
}

if [ -n "${VOYAGER_SUPABASE_ACCESS_TOKEN:-}" ]; then
  ACCESS_TOKEN="$VOYAGER_SUPABASE_ACCESS_TOKEN"
elif [ -r /Users/isaac/.supabase/access-token ]; then
  IFS= read -r ACCESS_TOKEN < /Users/isaac/.supabase/access-token
else
  command -v ssh >/dev/null || {
    printf 'knowledge-graph: ssh required for Fedora token fallback\n' >&2
    exit 2
  }
  ACCESS_TOKEN="$(ssh -o BatchMode=yes fedora \
    'test -r /home/isaac/.supabase/access-token && IFS= read -r token < /home/isaac/.supabase/access-token && printf %s "$token"')"
fi
[ -n "$ACCESS_TOKEN" ] || {
  printf 'knowledge-graph: Supabase access token unavailable\n' >&2
  exit 2
}

query_api() {
  local sql_file="$1"
  local response_file="$2"
  local payload_file="$TEMP_DIR/request.json"
  jq -Rs '{query: .}' "$sql_file" > "$payload_file"
  if ! curl --silent --show-error --fail-with-body \
    --request POST "$API_URL" \
    --header "Authorization: Bearer $ACCESS_TOKEN" \
    --header 'Content-Type: application/json' \
    --data-binary "@$payload_file" > "$response_file"; then
    jq -r '.message // .error // "Management API query failed"' "$response_file" >&2 2>/dev/null \
      || printf 'knowledge-graph: Management API query failed\n' >&2
    return 1
  fi
}

CATALOG_SQL="WITH targets AS (
  SELECT 'relation' AS object_type, c.relname AS object_name, c.relkind::text AS detail
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN (
    'knowledge_audiences', 'knowledge_units', 'graph_nodes', 'graph_edges',
    'graph_edges_target_idx')
  UNION ALL
  SELECT 'function', p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN (
    'normalize_knowledge_audience_members', 'intersect_knowledge_audience_members',
    'reject_immutable_knowledge_graph_row', 'guard_knowledge_event_audience',
    'validate_knowledge_audience', 'validate_knowledge_unit',
    'validate_graph_node_authority', 'guard_graph_node_identity',
    'validate_graph_edge', 'traverse_knowledge_graph')
  UNION ALL
  SELECT 'type', t.typname, t.typtype::text
  FROM pg_catalog.pg_type t
  JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname IN (
    'graph_node_kind', 'graph_edge_kind', 'knowledge_audience_scope_kind')
  UNION ALL
  SELECT 'trigger', t.tgname, c.relname
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND t.tgname IN (
    'trg_knowledge_audience_validate', 'trg_knowledge_audience_immutable',
    'trg_knowledge_event_audience_immutable', 'trg_knowledge_unit_validate',
    'trg_knowledge_unit_immutable', 'trg_graph_node_validate',
    'trg_graph_node_identity', 'trg_graph_edge_validate', 'trg_graph_edge_immutable')
  UNION ALL
  SELECT 'column', column_name, table_name
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'knowledge_events'
    AND column_name = 'knowledge_audience_id'
  UNION ALL
  SELECT 'constraint', con.conname, c.relname
  FROM pg_catalog.pg_constraint con
  JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'knowledge_events'
    AND con.conname = 'knowledge_events_knowledge_audience_id_fkey'
)
SELECT object_type, object_name, detail FROM targets
ORDER BY object_type, object_name, detail;"
printf '%s\n' "$CATALOG_SQL" > "$TEMP_DIR/catalog.sql"
query_api "$TEMP_DIR/catalog.sql" "$TEMP_DIR/catalog-before.json"
jq --sort-keys '.' "$TEMP_DIR/catalog-before.json" > "$TEMP_DIR/catalog-before.sorted.json"
if [ "$(jq 'length' "$TEMP_DIR/catalog-before.sorted.json")" -ne 0 ]; then
  printf 'knowledge-graph: target catalogue objects already exist; refusing rollback proof\n' >&2
  jq -r '.[] | "  \(.object_type):\(.object_name)"' "$TEMP_DIR/catalog-before.sorted.json" >&2
  exit 3
fi

"$VITE_NODE" "$GENERATOR" --output "$TEMP_DIR/generated-proof.sql"
if grep -Eq '^[[:space:]]*(BEGIN|COMMIT|ROLLBACK)[[:space:]]*;' \
  "${MIGRATIONS[@]}" "$TEMP_DIR/generated-proof.sql"; then
  printf 'knowledge-graph: nested transaction command refused\n' >&2
  exit 3
fi

{
  printf 'BEGIN;\n'
  printf "SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('voyager-knowledge-graph-poc'));\n"
  for migration in "${MIGRATIONS[@]}"; do
    sed -n '1,$p' "$migration"
  done
  sed -n '1,$p' "$TEMP_DIR/generated-proof.sql"
  printf 'ROLLBACK;\n'
  printf "SELECT 'KNOWLEDGE_GRAPH_SQL_GREEN' AS verdict;\n"
} > "$TEMP_DIR/transaction.sql"
query_api "$TEMP_DIR/transaction.sql" "$TEMP_DIR/transaction-response.json"
if ! jq -e 'any(.[]; .verdict == "KNOWLEDGE_GRAPH_SQL_GREEN")' \
  "$TEMP_DIR/transaction-response.json" >/dev/null; then
  printf 'knowledge-graph: transactional SQL proof returned no green verdict\n' >&2
  jq -c '.' "$TEMP_DIR/transaction-response.json" >&2
  exit 4
fi

query_api "$TEMP_DIR/catalog.sql" "$TEMP_DIR/catalog-after.json"
jq --sort-keys '.' "$TEMP_DIR/catalog-after.json" > "$TEMP_DIR/catalog-after.sorted.json"
if ! cmp -s "$TEMP_DIR/catalog-before.sorted.json" "$TEMP_DIR/catalog-after.sorted.json"; then
  printf 'knowledge-graph: post-run catalogue residue differs from pre-run\n' >&2
  diff -u "$TEMP_DIR/catalog-before.sorted.json" "$TEMP_DIR/catalog-after.sorted.json" >&2 || true
  exit 5
fi

NODE_COUNT="$(jq -r '.expected.nodeCount' "$FIXTURE")"
EDGE_COUNT="$(jq -r '.expected.edgeCount' "$FIXTURE")"
SHARED_CLAIM="$(jq -r '.expected.sharedClaim' "$FIXTURE")"
printf 'knowledge-graph: existing knowledge_events ledger | 2 fixed sources | participants NULL\n'
printf 'knowledge-graph: 6 kinds | %s nodes | %s edges | replay identical\n' "$NODE_COUNT" "$EDGE_COUNT"
printf 'knowledge-graph: graph on found "%s" with immutable source; graph off missed it\n' "$SHARED_CLAIM"
printf 'knowledge-graph: root denied | hidden bridge denied | victim private residue 0 | NULL denied\n'
printf 'knowledge-graph: NULL-audience source rejected | Person + Voyager rename stable | catalogue residue 0\n'
printf 'KNOWLEDGE_GRAPH_POC_GREEN\n'
