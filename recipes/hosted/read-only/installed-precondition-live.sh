#!/usr/bin/env bash
# Human-gate read-only check of the canonical installed pre-054 contract.
set -euo pipefail
umask 077
set +x

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
source "$REPO_ROOT/recipes/lib/hosted-target.sh"
source "$REPO_ROOT/recipes/lib/installed-precondition.sh"
hosted_target_require installed-precondition-live || exit $?
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-installed-live.XXXXXX")"

fail() {
  printf 'installed-precondition-live: %s\n' "$1" >&2
  exit 1
}
cleanup() {
  unset ACCESS_TOKEN PROJECT_REF VOYAGER_AUTHORIZED_SUPABASE_PROJECT_REF \
    VOYAGER_SUPABASE_ACCESS_TOKEN VOYAGER_SUPABASE_PROJECT_REF
  rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

hosted_access_token_require installed-precondition-live || exit $?
installed_precondition_assert_fragments "$REPO_ROOT" \
  || fail 'precondition SQL fragments are incomplete'
for command_name in curl jq; do
  command -v "$command_name" >/dev/null \
    || fail "missing required command: $command_name"
done

printf 'Authorization: Bearer %s\nContent-Type: application/json\n' \
  "$ACCESS_TOKEN" > "$TEMP_DIR/headers.txt"
chmod 600 "$TEMP_DIR/headers.txt"
API_URL="https://api.supabase.com/v1/projects/$PROJECT_REF/database/query/read-only"
unset ACCESS_TOKEN PROJECT_REF VOYAGER_AUTHORIZED_SUPABASE_PROJECT_REF \
  VOYAGER_SUPABASE_PROJECT_REF
installed_precondition_compose "$REPO_ROOT" |
  jq -Rs '{query: .}' > "$TEMP_DIR/request.json" \
  || fail 'could not encode precondition SQL'

if ! curl --disable --silent --fail-with-body --connect-timeout 15 --max-time 90 \
  --request POST "$API_URL" \
  --header "@$TEMP_DIR/headers.txt" \
  --data-binary "@$TEMP_DIR/request.json" \
  --output "$TEMP_DIR/response.json"; then
  fail 'Management API request failed'
fi
if jq -e '
    type == "array"
    and length == 1
    and .[0] == {
      "precondition_marker": "INSTALLED_PRE_054_PRECONDITION_GREEN"
    }
  ' "$TEMP_DIR/response.json" >/dev/null 2>&1; then
  printf '%s\n' "$INSTALLED_PRECONDITION_MARKER"
  exit 0
fi
FAILURE_ID="$(jq -er '
    if type == "array"
      and length == 1
      and (.[0] | keys) == ["precondition_marker"]
      and (.[0].precondition_marker | type) == "string"
    then .[0].precondition_marker
    else empty
    end
    | select(length <= 160)
    | select(test(
        "^(?:(?:missing_table|column|enum|default|table_privilege|function|unexpected_function_identity|unexpected_cleanup_function):[a-z0-9_.:-]+|(?:promotion_function_result|pre054_membership_shape|voyage_invite_identity|voyage_member_identity|space_member_identity|authority_uniqueness|space_members_extra_column|event_projection_trigger|spaces_id_default|space_members_state_check|promotion_foreign_keys))$"
      ))
  ' "$TEMP_DIR/response.json" 2>/dev/null)" \
  || fail 'Management API returned a malformed precondition verdict'
fail "precondition failed: $FAILURE_ID"
