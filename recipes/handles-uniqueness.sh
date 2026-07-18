#!/usr/bin/env bash
# Proving recipe — the handles namespace enforces case-insensitive uniqueness on
# dev (idx_handles_lower). Proves it against a pair of SENTINEL rows this recipe
# owns end-to-end — it NEVER inserts a case-variant of a real handle, so it can
# never delete real data (the old LIMIT-1 approach could, when the picked handle
# had no lowercase letters and the pkey — not idx_handles_lower — did the reject).
#
# Flow: seed a lowercase sentinel (which we own → safe to delete), attempt its
# UPPERCASE twin (must be rejected on lower(handle) uniqueness), then delete the
# sentinel by lower(handle) so cleanup only ever touches our own rows.
# Emits HANDLES_UNIQUE_OK. Requires ~/.supabase/access-token.
set -euo pipefail
TOKEN_FILE="${SUPABASE_ACCESS_TOKEN_FILE:-$HOME/.supabase/access-token}"
PROJECT_REF="${SUPABASE_PROJECT_REF:-iesprdzzgjypnksoljym}"
[ -r "$TOKEN_FILE" ] || { echo "MISSING $TOKEN_FILE — cannot run live uniqueness recipe" >&2; exit 2; }
ACCESS_TOKEN="$(cat "$TOKEN_FILE")"

SENTINEL="zz_oru447_casetest"
SENTINEL_UPPER="ZZ_ORU447_CASETEST"

# `q <sql>` runs one statement; `-f` makes curl exit non-zero on an HTTP error so
# set -e catches a transport failure. The Bearer token is only ever in the header,
# never echoed. Query text is JSON-encoded via jq so it can't break the payload.
q() { curl -sf -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"query\": $(printf '%s' "$1" | jq -Rs .)}"; }

# An FK-valid owner (handles.owner_user_id → profiles.id). Read-only; ORDER BY id
# makes the pick deterministic. We attach our sentinels to this owner but only
# ever delete rows whose lower(handle) is our sentinel, never this owner's real ones.
owner="$(q "SELECT id FROM public.profiles ORDER BY id LIMIT 1;" | jq -r '.[0].id')"
[ -n "$owner" ] && [ "$owner" != "null" ] || { echo "no profiles to own the sentinel" >&2; exit 1; }

cleanup() { q "DELETE FROM public.handles WHERE lower(handle) = '$SENTINEL';" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Clear any leftover sentinel from an aborted prior run, then seed the lowercase one.
cleanup
q "INSERT INTO public.handles (handle, kind, owner_user_id) VALUES ('$SENTINEL','human','$owner');" >/dev/null

# The UPPERCASE twin must be rejected — it shares lower(handle) with the sentinel.
# Accept EITHER a lower(handle) unique-index rejection OR any 23505; the point is
# that the case-variant is refused, and both name the same invariant.
resp="$(curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"query\": $(printf '%s' "INSERT INTO public.handles (handle, kind, owner_user_id) VALUES ('$SENTINEL_UPPER','human','$owner');" | jq -Rs .)}")"

if printf '%s' "$resp" | grep -Eq "idx_handles_lower|duplicate key|23505"; then
  echo "case-variant '$SENTINEL_UPPER' rejected against '$SENTINEL' (as expected)"
  echo "HANDLES_UNIQUE_OK"
else
  echo "UNEXPECTED: cross-case insert not rejected — resp: $resp" >&2
  # Remove the stray uppercase row too (still a sentinel we own).
  q "DELETE FROM public.handles WHERE lower(handle) = '$SENTINEL';" >/dev/null 2>&1 || true
  exit 1
fi
