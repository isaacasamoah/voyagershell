#!/usr/bin/env bash
# Proving recipe — the handles namespace enforces case-insensitive uniqueness on
# dev (idx_handles_lower). NON-MUTATING: attempts to insert a cross-case dup of an
# existing handle, which fails on the unique index before any commit — nothing is
# written. Emits HANDLES_UNIQUE_OK. Requires ~/.supabase/access-token.
set -euo pipefail
TOKEN_FILE="${SUPABASE_ACCESS_TOKEN_FILE:-$HOME/.supabase/access-token}"
PROJECT_REF="${SUPABASE_PROJECT_REF:-iesprdzzgjypnksoljym}"
[ -r "$TOKEN_FILE" ] || { echo "MISSING $TOKEN_FILE — cannot run live uniqueness recipe" >&2; exit 2; }
ACCESS_TOKEN="$(cat "$TOKEN_FILE")"

q() { curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"query\": $(echo "$1" | jq -Rs .)}"; }

# Grab any existing handle + its owner (FK-valid), then try the UPPERCASE variant.
row="$(q "SELECT handle, owner_user_id FROM public.handles LIMIT 1;")"
handle="$(echo "$row" | jq -r '.[0].handle')"
owner="$(echo "$row" | jq -r '.[0].owner_user_id')"
[ -n "$handle" ] && [ "$handle" != "null" ] || { echo "no handles to test against" >&2; exit 1; }

upper="$(echo "$handle" | tr '[:lower:]' '[:upper:]')"
resp="$(q "INSERT INTO public.handles (handle, kind, owner_user_id) VALUES ('$upper','human','$owner');")"

if echo "$resp" | grep -q "idx_handles_lower"; then
  echo "case-insensitive dup '$upper' rejected against existing '$handle' (as expected)"
  echo "HANDLES_UNIQUE_OK"
else
  echo "UNEXPECTED: cross-case insert not rejected — resp: $resp" >&2
  # Safety: if it somehow inserted, remove the stray uppercase row.
  q "DELETE FROM public.handles WHERE handle='$upper';" >/dev/null
  exit 1
fi
