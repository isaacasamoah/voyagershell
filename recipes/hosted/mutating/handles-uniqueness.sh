#!/usr/bin/env bash
# Proving recipe — the handles namespace enforces case-insensitive uniqueness on
# an explicitly authorized hosted target. Proves it against a pair of sentinel
# rows this recipe
# owns end-to-end — it NEVER inserts a case-variant of a real handle, so it can
# never delete real data (the old LIMIT-1 approach could, when the picked handle
# had no lowercase letters and the pkey — not idx_handles_lower — did the reject).
#
# Flow: seed a lowercase sentinel (which we own → safe to delete), attempt its
# UPPERCASE twin (must be rejected on lower(handle) uniqueness), then delete the
# sentinel by lower(handle) so cleanup only ever touches our own rows.
# Emits HANDLES_UNIQUE_OK. Requires explicit target authorization, mutation
# confirmation, and an injected Management API token.
set -euo pipefail
set +x
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
source "$REPO_ROOT/recipes/lib/hosted-target.sh"
hosted_target_require handles-uniqueness || exit $?
hosted_confirmation_require handles-uniqueness \
  VOYAGER_ALLOW_HOSTED_MUTATION || exit $?
hosted_access_token_require handles-uniqueness || exit $?
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-handles-proof.XXXXXX")"

SENTINEL="zz_voyager_casetest"
SENTINEL_UPPER="ZZ_VOYAGER_CASETEST"
SENTINEL_CREATED=0

cleanup() {
  if [ "$SENTINEL_CREATED" -eq 1 ]; then
    q "DELETE FROM public.handles WHERE lower(handle) = '$SENTINEL';" \
      >/dev/null 2>&1 || true
  fi
  rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

printf 'Authorization: Bearer %s\nContent-Type: application/json\n' \
  "$ACCESS_TOKEN" > "$TEMP_DIR/headers.txt"
unset ACCESS_TOKEN VOYAGER_AUTHORIZED_SUPABASE_PROJECT_REF \
  VOYAGER_ALLOW_HOSTED_MUTATION VOYAGER_SUPABASE_PROJECT_REF

# `q <sql>` runs one statement; `-f` makes curl exit non-zero on an HTTP error so
# set -e catches a transport failure. The Bearer token is only ever in the header,
# never echoed. Query text is JSON-encoded via jq so it can't break the payload.
q() { curl --disable --silent --show-error --fail-with-body \
  --connect-timeout 15 --max-time 180 \
  --request POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  --header "@$TEMP_DIR/headers.txt" \
  -d "{\"query\": $(printf '%s' "$1" | jq -Rs .)}"; }

# An FK-valid owner (handles.owner_user_id → profiles.id). Read-only; ORDER BY id
# makes the pick deterministic. We attach our sentinels to this owner but only
# ever delete rows whose lower(handle) is our sentinel, never this owner's real ones.
owner="$(q "SELECT id FROM public.profiles ORDER BY id LIMIT 1;" | jq -r '.[0].id')"
[ -n "$owner" ] && [ "$owner" != "null" ] || { echo "no profiles to own the sentinel" >&2; exit 1; }

# Clear any leftover sentinel from an aborted prior run, then seed the lowercase one.
q "DELETE FROM public.handles WHERE lower(handle) = '$SENTINEL';" >/dev/null
q "INSERT INTO public.handles (handle, kind, owner_user_id) VALUES ('$SENTINEL','human','$owner');" >/dev/null
SENTINEL_CREATED=1

# The UPPERCASE twin must be rejected — it shares lower(handle) with the sentinel.
# Accept EITHER a lower(handle) unique-index rejection OR any 23505; the point is
# that the case-variant is refused, and both name the same invariant.
resp="$(curl --disable --silent --show-error \
  --connect-timeout 15 --max-time 180 \
  --request POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  --header "@$TEMP_DIR/headers.txt" \
  -d "{\"query\": $(printf '%s' "INSERT INTO public.handles (handle, kind, owner_user_id) VALUES ('$SENTINEL_UPPER','human','$owner');" | jq -Rs .)}")"

if printf '%s' "$resp" | grep -Eq "idx_handles_lower|duplicate key|23505"; then
  echo "case-variant '$SENTINEL_UPPER' rejected against '$SENTINEL' (as expected)"
  echo "HANDLES_UNIQUE_OK"
else
  echo "UNEXPECTED: cross-case insert was not rejected" >&2
  # Remove the stray uppercase row too (still a sentinel we own).
  q "DELETE FROM public.handles WHERE lower(handle) = '$SENTINEL';" >/dev/null 2>&1 || true
  exit 1
fi
