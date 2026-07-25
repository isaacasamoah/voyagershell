#!/usr/bin/env bash

SHA256_COMMAND=()

select_sha256_command() {
  if command -v sha256sum >/dev/null 2>&1; then
    SHA256_COMMAND=(sha256sum)
  elif command -v shasum >/dev/null 2>&1; then
    SHA256_COMMAND=(shasum -a 256)
  else
    printf 'sha256: neither sha256sum nor shasum is available\n' >&2
    return 1
  fi
}

sha256_digest() {
  local output digest
  [ "${#SHA256_COMMAND[@]}" -gt 0 ] || {
    printf 'sha256: command was not selected\n' >&2
    return 1
  }
  output="$("${SHA256_COMMAND[@]}" "$@")" || return
  read -r digest _ <<< "$output"
  [ -n "$digest" ] || {
    printf 'sha256: command returned no digest\n' >&2
    return 1
  }
  printf '%s\n' "$digest"
}
