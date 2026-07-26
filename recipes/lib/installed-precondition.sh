#!/usr/bin/env bash

INSTALLED_PRECONDITION_MARKER=INSTALLED_PRE_054_PRECONDITION_GREEN
INSTALLED_PRECONDITION_FRAGMENTS=(
  recipes/sql/installed-pre-054-precondition/expectations.sql
  recipes/sql/installed-pre-054-precondition/catalog.sql
  recipes/sql/installed-pre-054-precondition/verdict.sql
)

installed_precondition_assert_fragments() {
  local repository_root="$1"
  local fragment
  for fragment in "${INSTALLED_PRECONDITION_FRAGMENTS[@]}"; do
    [ -f "$repository_root/$fragment" ] || {
      printf 'installed-precondition: missing SQL fragment: %s\n' "$fragment" >&2
      return 1
    }
  done
}

installed_precondition_compose() {
  local repository_root="$1"
  local fragment
  installed_precondition_assert_fragments "$repository_root" || return
  for fragment in "${INSTALLED_PRECONDITION_FRAGMENTS[@]}"; do
    /bin/cat "$repository_root/$fragment" || return
  done
}
