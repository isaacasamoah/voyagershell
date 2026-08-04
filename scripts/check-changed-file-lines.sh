#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly line_cap=250
readonly base_ref="${1:-HEAD}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "strict line cap: run this check inside a Git worktree" >&2
  exit 2
fi

if ! git rev-parse --verify "${base_ref}^{commit}" >/dev/null 2>&1; then
  echo "strict line cap: base is not a commit: ${base_ref}" >&2
  exit 2
fi

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/voyager-line-cap.XXXXXX")"
readonly temp_dir
readonly tracked_files="$temp_dir/tracked.nul"
readonly untracked_files="$temp_dir/untracked.nul"

cleanup() {
  rm -rf -- "$temp_dir"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

if ! git diff --name-only --diff-filter=ACMR -z "$base_ref" -- > "$tracked_files"; then
  echo "strict line cap: failed to enumerate tracked changes" >&2
  exit 2
fi

if ! git ls-files --others --exclude-standard -z > "$untracked_files"; then
  echo "strict line cap: failed to enumerate untracked files" >&2
  exit 2
fi

checked_count=0
violation_count=0

check_file() {
  local file_name="$1"
  local line_total

  # Append-only, generated, data, and prose artifacts are not refactorable source.
  case "$file_name" in
    supabase/migrations/*|\
    recipes/*|\
    docs/*|\
    *.md|*.json|*.sql) return ;;
  esac

  case "$file_name" in
    *.ts|*.tsx) ;;
    *) return ;;
  esac

  [[ -f "$file_name" ]] || return
  line_total=$(awk 'END { print NR }' < "$file_name")
  ((checked_count += 1))

  if ((line_total >= line_cap)); then
    printf 'strict line cap: %s has %d lines; expected fewer than %d\n' \
      "$file_name" "$line_total" "$line_cap" >&2
    ((violation_count += 1))
  fi
}

while IFS= read -r -d '' file_name; do
  check_file "$file_name"
done < "$tracked_files"

while IFS= read -r -d '' file_name; do
  check_file "$file_name"
done < "$untracked_files"

if ((violation_count > 0)); then
  exit 1
fi

printf 'Strict line cap passed: %d changed TypeScript source files are all under %d lines.\n' \
  "$checked_count" "$line_cap"
