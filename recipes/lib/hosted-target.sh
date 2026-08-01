# Shared fail-closed authorization for every hosted Supabase recipe.

hosted_target_require() {
  local runner_name="$1"
  local target_ref="${VOYAGER_SUPABASE_PROJECT_REF:-}"
  local authorized_ref="${VOYAGER_AUTHORIZED_SUPABASE_PROJECT_REF:-}"

  if [ -z "$target_ref" ]; then
    printf '%s: VOYAGER_SUPABASE_PROJECT_REF is required\n' "$runner_name" >&2
    return 2
  fi
  if [ -z "$authorized_ref" ]; then
    printf '%s: VOYAGER_AUTHORIZED_SUPABASE_PROJECT_REF is required\n' \
      "$runner_name" >&2
    return 2
  fi
  local project_ref
  for project_ref in "$target_ref" "$authorized_ref"; do
    case "$project_ref" in
      *[!a-z0-9]*)
        printf '%s: hosted project refs must be lowercase alphanumeric\n' \
          "$runner_name" >&2
        return 2
        ;;
    esac
  done
  if [ "$target_ref" != "$authorized_ref" ]; then
    printf '%s: target is not explicitly authorized\n' "$runner_name" >&2
    return 3
  fi
  PROJECT_REF="$target_ref"
}

hosted_confirmation_require() {
  local runner_name="$1"
  local confirmation_name="$2"

  if [ "${!confirmation_name:-}" != "1" ]; then
    printf '%s: %s=1 is required\n' "$runner_name" "$confirmation_name" >&2
    return 3
  fi
}

hosted_access_token_require() {
  local runner_name="$1"

  if [ -z "${VOYAGER_SUPABASE_ACCESS_TOKEN:-}" ]; then
    printf '%s: VOYAGER_SUPABASE_ACCESS_TOKEN is required\n' \
      "$runner_name" >&2
    return 2
  fi
  case "$VOYAGER_SUPABASE_ACCESS_TOKEN" in
    *$'\r'*|*$'\n'*)
      printf '%s: VOYAGER_SUPABASE_ACCESS_TOKEN is invalid\n' \
        "$runner_name" >&2
      return 2
      ;;
  esac
  ACCESS_TOKEN="$VOYAGER_SUPABASE_ACCESS_TOKEN"
  unset VOYAGER_SUPABASE_ACCESS_TOKEN
}
