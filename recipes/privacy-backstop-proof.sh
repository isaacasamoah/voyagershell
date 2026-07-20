#!/usr/bin/env bash
# =============================================================================
# ORU-450 privacy-backstop proof — cold runner (the Test-gate instrument)
# =============================================================================
# Runs supabase/tests/051_privacy_backstop_proof.sql against the Supabase
# preview db via the Management API (the repo's canonical SQL path — no
# psql/CLI; see CLAUDE.md "Supabase Migrations"). Pattern: ORU-453's
# scripts/poc/run-052-proof.sh.
#
# The proof file is written for psql (`\set` variables). This runner inlines
# those six constants and refuses to send anything that still carries a psql
# variable, so the Management API only ever sees plain SQL. The proof is one
# transaction that ends in ROLLBACK — non-destructive, seed rows discarded.
#
# Self-locating: resolves its own repo root, so it runs from any cwd.
# Expected final output:  ALL PASS
# Exit 0 on pass, non-zero on any probe failure.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROOF_SQL="$REPO_ROOT/supabase/tests/051_privacy_backstop_proof.sql"

ACCESS_TOKEN="$(cat "$HOME/.supabase/access-token")"
PROJECT_REF="iesprdzzgjypnksoljym"   # voyager preview (per CLAUDE.md)

[ -f "$PROOF_SQL" ] || { echo "MISSING proof: $PROOF_SQL" >&2; exit 2; }

PAYLOAD="$(python3 - "$PROOF_SQL" <<'PY'
import json, re, sys
src = open(sys.argv[1]).read()
consts = dict(re.findall(r"^\\set (\w+) '([^']*)'", src, re.M))
body = re.sub(r"^\\set.*$", "", src, flags=re.M)
for k, v in consts.items():
    body = body.replace(f":'{k}'", f"'{v}'")
leftover = re.findall(r":'?\w+'?", body)
leftover = [t for t in leftover if re.match(r":'\w+'", t)]
if leftover:
    sys.stderr.write(f"unresolved psql variables: {sorted(set(leftover))}\n")
    sys.exit(3)
# The Management API does not relay RAISE NOTICE output. A failed probe raises
# an exception (whole request errors), so this trailing SELECT runs — and
# returns its row — only when every probe passed and the ROLLBACK completed.
body += "\nSELECT 'ALL PASS' AS verdict;"
print(json.dumps({"query": body}))
PY
)"

RESP="$(curl -s -X POST \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")"

echo "API response: $RESP"

if printf '%s' "$RESP" | grep -q 'ALL PASS'; then
  echo "ALL PASS"
  exit 0
fi
echo "PROOF FAILED — see API response above" >&2
exit 1
