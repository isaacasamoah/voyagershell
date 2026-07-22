#!/usr/bin/env bash
# =============================================================================
# ORU-450 privacy-backstop proof — cold runner (the Test-gate instrument)
# =============================================================================
# Runs the two supabase/tests/051_* privacy proofs against the Supabase preview
# db via the Management API (the repo's canonical SQL path — no
# psql/CLI; see CLAUDE.md "Supabase Migrations"). Pattern: ORU-453's
# scripts/poc/run-052-proof.sh.
#
# The proof files use psql `\set` variables. This runner inlines every constant
# and refuses to send unresolved variables. Each proof owns a transaction that
# ends in ROLLBACK, so every seed row is discarded.
#
# Self-locating: resolves its own repo root, so it runs from any cwd.
# Expected final output:  ALL PASS
# Exit 0 on pass, non-zero on any probe failure.
# =============================================================================
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROOF_SQLS=(
  "$REPO_ROOT/supabase/tests/051_privacy_backstop_proof.sql"
  "$REPO_ROOT/supabase/tests/051_space_privacy_proof.sql"
)
PROJECT_REF="iesprdzzgjypnksoljym"   # voyager preview (per CLAUDE.md)
API_URL="https://api.supabase.com/v1/projects/$PROJECT_REF/database/query"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-privacy-backstop.XXXXXX")"

cleanup() {
  unset ACCESS_TOKEN VOYAGER_SUPABASE_ACCESS_TOKEN
  rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT

for command_name in curl jq python3; do
  command -v "$command_name" >/dev/null || {
    printf 'privacy-backstop: missing required command: %s\n' "$command_name" >&2
    exit 2
  }
done

for proof_sql in "${PROOF_SQLS[@]}"; do
  [ -f "$proof_sql" ] || {
    printf 'privacy-backstop: missing proof: %s\n' "$proof_sql" >&2
    exit 2
  }
done

if [ -n "${VOYAGER_SUPABASE_ACCESS_TOKEN:-}" ]; then
  ACCESS_TOKEN="$VOYAGER_SUPABASE_ACCESS_TOKEN"
elif [ -r /Users/isaac/.supabase/access-token ]; then
  IFS= read -r ACCESS_TOKEN < /Users/isaac/.supabase/access-token || true
else
  command -v ssh >/dev/null || {
    printf 'privacy-backstop: ssh required for Fedora token fallback\n' >&2
    exit 2
  }
  if ! ACCESS_TOKEN="$(ssh -o BatchMode=yes fedora '
    test -r /home/isaac/.supabase/access-token || exit 1
    token=
    IFS= read -r token < /home/isaac/.supabase/access-token || true
    test -n "$token" || exit 1
    printf %s "$token"
  ')"; then
    printf 'privacy-backstop: Fedora Supabase token fallback failed\n' >&2
    exit 2
  fi
fi
[ -n "$ACCESS_TOKEN" ] || {
  printf 'privacy-backstop: Supabase access token unavailable\n' >&2
  exit 2
}
printf 'Authorization: Bearer %s\nContent-Type: application/json\n' \
  "$ACCESS_TOKEN" > "$TEMP_DIR/headers.txt"
unset ACCESS_TOKEN VOYAGER_SUPABASE_ACCESS_TOKEN

python3 - "${PROOF_SQLS[@]}" > "$TEMP_DIR/request.json" <<'PY'
import json, re, sys
src = "\n".join(open(path).read() for path in sys.argv[1:])
consts = dict(re.findall(r"^\\set (\w+) '([^']*)'", src, re.M))
body = re.sub(r"^\\set.*$", "", src, flags=re.M)
for k, v in consts.items():
    body = body.replace(f":'{k}'", f"'{v}'")
leftover = re.findall(r":'?\w+'?", body)
leftover = [t for t in leftover if re.match(r":'\w+'", t)]
if leftover:
    sys.stderr.write(f"unresolved psql variables: {sorted(set(leftover))}\n")
    sys.exit(3)
transactions = re.findall(
    r"^\s*(BEGIN|COMMIT|ROLLBACK)\s*;\s*(?:--.*)?$", body, re.I | re.M
)
if [statement.upper() for statement in transactions] != [
    "BEGIN", "ROLLBACK", "BEGIN", "ROLLBACK"
]:
    sys.stderr.write("privacy proofs must each contain one rollback-only transaction\n")
    sys.exit(3)
# The Management API does not relay RAISE NOTICE output. A failed probe raises
# an exception (whole request errors), so this trailing SELECT runs — and
# returns its row — only when every probe passed and the ROLLBACK completed.
body += "\nSELECT 'ALL PASS' AS verdict;"
print(json.dumps({"query": body}))
PY

if ! curl --silent --show-error --fail-with-body \
  --request POST "$API_URL" \
  --header "@$TEMP_DIR/headers.txt" \
  --data-binary "@$TEMP_DIR/request.json" \
  --output "$TEMP_DIR/response.json"; then
  printf 'privacy-backstop: Management API request failed\n' >&2
  exit 1
fi
if ! jq -e 'type == "array" and length == 1 and .[0] == {"verdict":"ALL PASS"}' \
  "$TEMP_DIR/response.json" >/dev/null; then
  printf 'privacy-backstop: Management API returned no exact ALL PASS verdict\n' >&2
  exit 1
fi
printf 'ALL PASS\n'
