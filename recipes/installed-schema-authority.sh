#!/usr/bin/env bash
# Deterministic precondition -> 054-059 -> catalogue/ACL authority proof.
set -euo pipefail
export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/docker-proof.sh"
source "$SCRIPT_DIR/lib/sha256.sh"
IMAGE=pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee
DATABASE=voyager_installed
CONTAINER_NAME="voyager-installed-$(date +%s)-$$"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/voyager-installed.XXXXXX")"
BASE_REVISION=c7e1199222f519e60999eb7c9037368f297d115a
INVITE_FIXTURE=recipes/sql/installed-pre-054/invites.sql
POSTCONDITION=recipes/sql/installed-post-059-contract.sql
ASSERTIONS=(
  recipes/sql/installed-invite-transition-assertions.sql
  recipes/sql/installed-authority-assertions.sql
  recipes/sql/installed-session-application-assertions.sql
  recipes/sql/installed-catalogue-assertions.sql
  recipes/sql/installed-membership-revocation-assertions.sql
)
MIGRATIONS=(
  supabase/migrations/054_active_membership_authority.sql
  supabase/migrations/055_active_knowledge_retrieval.sql
  supabase/migrations/056_room_invite_authority.sql
  supabase/migrations/057_room_invite_transition.sql
  supabase/migrations/058_private_reply_promotion_authority.sql
  supabase/migrations/059_session_authority_cleanup.sql
)

fail() { printf 'installed-schema: %s\n' "$1" >&2; exit 1; }
cleanup() {
  docker_proof_cleanup "$CONTAINER_NAME"
  rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

command -v docker >/dev/null || fail 'docker is required'
command -v git >/dev/null || fail 'git is required'
command -v awk >/dev/null || fail 'awk is required'
command -v cmp >/dev/null || fail 'cmp is required'
select_sha256_command || fail 'SHA-256 command selection failed'
git -C "$REPO_ROOT" cat-file -e "$BASE_REVISION^{commit}" 2>/dev/null \
  || fail 'sealed base revision is unavailable'
docker_proof_detect_security >/dev/null 2>&1 || fail 'Docker daemon is unavailable'
docker image inspect "$IMAGE" >/dev/null 2>&1 \
  || fail 'the pinned pgvector image must already exist locally; pulling is forbidden'
for path in "$DOCKER_PROOF_PRE054_BASELINE" "$INVITE_FIXTURE" "$POSTCONDITION" \
  "${ASSERTIONS[@]}" "${MIGRATIONS[@]}"; do
  [ -f "$REPO_ROOT/$path" ] || fail "missing proof input: $path"
done
installed_precondition_assert_fragments "$REPO_ROOT" \
  || fail 'precondition SQL fragments are incomplete'

git -C "$REPO_ROOT" ls-tree -r --name-only "$BASE_REVISION" -- supabase/migrations \
  | awk -F/ '
      $NF ~ /^[0-9][0-9][0-9].*\.sql$/ && (substr($NF, 1, 3) + 0) <= 53
    ' | sort > "$TEMP_DIR/expected-001-053.txt"
{
  for migration in "$REPO_ROOT"/supabase/migrations/*.sql; do
    name="${migration##*/}"
    number="${name:0:3}"
    if [[ "$number" =~ ^[0-9][0-9][0-9]$ ]] && [ "$((10#$number))" -le 53 ]; then
      printf 'supabase/migrations/%s\n' "$name"
    fi
  done
} | sort > "$TEMP_DIR/current-001-053.txt"
cmp -s "$TEMP_DIR/expected-001-053.txt" "$TEMP_DIR/current-001-053.txt" \
  || fail 'migration source file set 001-053 differs from sealed base'
while IFS= read -r relative; do
  [ -n "$relative" ] || continue
  expected="$(git -C "$REPO_ROOT" show "$BASE_REVISION:$relative" | sha256_digest)"
  actual="$(sha256_digest "$REPO_ROOT/$relative")"
  [ "$actual" = "$expected" ] || fail "migration source changed from sealed base: $relative"
  printf '%s  %s\n' "$actual" "$relative" >> "$TEMP_DIR/001-053.sha256"
done < "$TEMP_DIR/expected-001-053.txt"

docker_proof_run --detach --rm --pull=never --name "$CONTAINER_NAME" --network none \
  --volume "$REPO_ROOT:/workspace:ro" -e POSTGRES_DB="$DATABASE" \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE" >/dev/null
docker_proof_wait_ready "$CONTAINER_NAME" "$DATABASE" \
  || fail 'PostgreSQL readiness timeout'

docker_proof_install_pre054 "$CONTAINER_NAME" "$DATABASE" \
  || fail 'pre-054 installed-state baseline or contract failed'
docker exec "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
  --single-transaction -U postgres -d "$DATABASE" \
  -f "/workspace/$INVITE_FIXTURE"
for migration in "${MIGRATIONS[@]}"; do
  docker exec "$CONTAINER_NAME" psql -X -q -v ON_ERROR_STOP=1 \
    --single-transaction -U postgres -d "$DATABASE" \
    -f "/workspace/$migration"
done
postcondition="$(docker exec "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
  -U postgres -d "$DATABASE" -f "/workspace/$POSTCONDITION")"
[ "$postcondition" = INSTALLED_POST_059_CONTRACT_GREEN ] \
  || fail 'post-059 catalogue/type/ACL contract failed'
verdict=
application_verdict=
invite_verdict=
for assertions in "${ASSERTIONS[@]}"; do
  verdict="$(docker exec "$CONTAINER_NAME" psql -X -Atq -v ON_ERROR_STOP=1 \
    -U postgres -d "$DATABASE" -f "/workspace/$assertions")"
  if [ "$assertions" = recipes/sql/installed-session-application-assertions.sql ]; then
    application_verdict="$verdict"
  fi
  if [ "$assertions" = recipes/sql/installed-invite-transition-assertions.sql ]; then
    invite_verdict="$verdict"
  fi
done
[ "$invite_verdict" = INSTALLED_INVITE_TRANSITION_GREEN ] \
  || fail 'installed invite transition proof failed'
[ "$application_verdict" = INSTALLED_SESSION_APPLICATION_CALL_GREEN ] \
  || fail 'installed session application-call proof failed'
[ "$verdict" = INSTALLED_SCHEMA_AUTHORITY_GREEN ] \
  || fail 'installed authority green marker missing'

printf '%s\n' MIGRATION_SOURCE_001_053_SEAL_GREEN
printf '%s\n' "$INSTALLED_PRECONDITION_MARKER"
printf '%s\n' "$postcondition"
printf '%s\n' "$invite_verdict"
printf '%s\n' "$application_verdict"
printf '%s\n' "$verdict"
