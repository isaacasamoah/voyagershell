#!/usr/bin/env bash

DOCKER_PROOF_LIB_DIR="${BASH_SOURCE[0]%/*}"
DOCKER_PROOF_REPO_ROOT="$(cd "$DOCKER_PROOF_LIB_DIR/../.." && pwd)"
source "$DOCKER_PROOF_LIB_DIR/installed-precondition.sh"

DOCKER_PROOF_SELINUX=false
DOCKER_PROOF_PRE054_BASELINE=recipes/sql/installed-pre-054-baseline.sql

docker_proof_detect_security() {
  local security_options
  security_options="$(docker info --format '{{json .SecurityOptions}}')" || return 1
  DOCKER_PROOF_SELINUX=false
  if [[ "$security_options" == *selinux* ]]; then
    DOCKER_PROOF_SELINUX=true
  fi
}

docker_proof_run() {
  if [ "$DOCKER_PROOF_SELINUX" = true ]; then
    docker run --security-opt label=disable "$@"
  else
    docker run "$@"
  fi
}

docker_proof_wait_ready() {
  local container_name="$1"
  local database_name="$2"
  local attempt pid_one probe
  for ((attempt = 0; attempt < 100; attempt++)); do
    if pid_one="$(docker exec "$container_name" sh -c 'cat /proc/1/comm' 2>/dev/null)" &&
        [ "$pid_one" = postgres ]; then
      if probe="$(docker exec "$container_name" psql -X -Atq -v ON_ERROR_STOP=1 \
          -U postgres -d "$database_name" -c 'SELECT 1' 2>/dev/null)" &&
          [ "$probe" = 1 ]; then
        return 0
      fi
    fi
    sleep 0.1
  done
  return 1
}

docker_proof_cleanup() {
  local container_name="$1"
  local child_pids="${2:-}"
  local child_pid
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  for child_pid in $child_pids; do
    wait "$child_pid" 2>/dev/null || true
  done
}

docker_proof_install_pre054() {
  local container_name="$1"
  local database_name="$2"
  local marker
  docker exec "$container_name" psql -X -q -v ON_ERROR_STOP=1 \
    --single-transaction -U postgres -d "$database_name" \
    -f "/workspace/$DOCKER_PROOF_PRE054_BASELINE" >/dev/null || return
  marker="$(installed_precondition_compose "$DOCKER_PROOF_REPO_ROOT" |
    docker exec -i "$container_name" psql -X -Atq -v ON_ERROR_STOP=1 \
      -U postgres -d "$database_name")" || return
  [ "$marker" = "$INSTALLED_PRECONDITION_MARKER" ] || {
    printf 'docker-proof: pre-054 installed-state contract failed\n' >&2
    return 1
  }
  marker="$({
    printf 'BEGIN;\n'
    printf 'ALTER TABLE public.spaces RENAME TO spaces_precondition_missing;\n'
    installed_precondition_compose "$DOCKER_PROOF_REPO_ROOT"
    printf 'ROLLBACK;\n'
  } | docker exec -i "$container_name" psql -X -Atq -v ON_ERROR_STOP=1 \
      -U postgres -d "$database_name")" || return
  [ "$marker" = missing_table:spaces ] || {
    printf 'docker-proof: missing-table precondition verdict failed\n' >&2
    return 1
  }
  marker="$({
    printf 'BEGIN;\n'
    printf 'ALTER TABLE public.voyages DROP CONSTRAINT voyages_invite_code_key;\n'
    installed_precondition_compose "$DOCKER_PROOF_REPO_ROOT"
    printf 'ROLLBACK;\n'
  } | docker exec -i "$container_name" psql -X -Atq -v ON_ERROR_STOP=1 \
      -U postgres -d "$database_name")" || return
  [ "$marker" = voyage_invite_identity ] || {
    printf 'docker-proof: voyage-invite precondition verdict failed\n' >&2
    return 1
  }
  marker="$({
    printf 'BEGIN;\n'
    printf 'DROP TRIGGER on_knowledge_event_insert ON public.knowledge_events;\n'
    printf '%s\n' \
      'CREATE TRIGGER on_knowledge_event_insert AFTER INSERT ON public.knowledge_events' \
      '  FOR EACH ROW EXECUTE FUNCTION public.update_search_vector();'
    installed_precondition_compose "$DOCKER_PROOF_REPO_ROOT"
    printf 'ROLLBACK;\n'
  } | docker exec -i "$container_name" psql -X -Atq -v ON_ERROR_STOP=1 \
      -U postgres -d "$database_name")" || return
  [ "$marker" = event_projection_trigger ] || {
    printf 'docker-proof: wrong-trigger precondition verdict failed\n' >&2
    return 1
  }
  marker="$({
    printf 'BEGIN;\n'
    printf '%s\n' \
      'ALTER TABLE public.private_reply_promotions' \
      '  DROP CONSTRAINT private_reply_promotions_shared_event_fkey;' \
      'ALTER TABLE public.private_reply_promotions' \
      '  ADD CONSTRAINT private_reply_promotions_shared_event_fkey' \
      '  FOREIGN KEY (shared_event_id) REFERENCES public.profiles(id)' \
      '  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;'
    installed_precondition_compose "$DOCKER_PROOF_REPO_ROOT"
    printf 'ROLLBACK;\n'
  } | docker exec -i "$container_name" psql -X -Atq -v ON_ERROR_STOP=1 \
      -U postgres -d "$database_name")" || return
  [ "$marker" = promotion_foreign_keys ] || {
    printf 'docker-proof: wrong-foreign-key precondition verdict failed\n' >&2
    return 1
  }
  marker="$({
    printf 'BEGIN;\n'
    printf '%s\n' \
      'ALTER TABLE public.private_reply_promotions' \
      '  ADD CONSTRAINT precondition_unexpected_promotion_fkey' \
      '  FOREIGN KEY (source_event_id) REFERENCES public.knowledge_events(id);'
    installed_precondition_compose "$DOCKER_PROOF_REPO_ROOT"
    printf 'ROLLBACK;\n'
  } | docker exec -i "$container_name" psql -X -Atq -v ON_ERROR_STOP=1 \
      -U postgres -d "$database_name")" || return
  [ "$marker" = promotion_foreign_keys ] || {
    printf 'docker-proof: extra-foreign-key precondition verdict failed\n' >&2
    return 1
  }
  marker="$({
    printf 'BEGIN;\n'
    printf '%s\n' \
      "ALTER TABLE public.space_members ALTER COLUMN state SET DEFAULT 'invited';"
    installed_precondition_compose "$DOCKER_PROOF_REPO_ROOT"
    printf 'ROLLBACK;\n'
  } | docker exec -i "$container_name" psql -X -Atq -v ON_ERROR_STOP=1 \
      -U postgres -d "$database_name")" || return
  [ "$marker" = default:space_members.state ] || {
    printf 'docker-proof: state-default precondition verdict failed\n' >&2
    return 1
  }
  marker="$({
    printf 'BEGIN;\n'
    printf '%s\n' \
      'ALTER TABLE public.space_members DROP CONSTRAINT space_members_state_check;' \
      'ALTER TABLE public.space_members ADD CONSTRAINT space_members_state_check' \
      "  CHECK (state IN ('invited', 'active', 'left', 'blocked'));"
    installed_precondition_compose "$DOCKER_PROOF_REPO_ROOT"
    printf 'ROLLBACK;\n'
  } | docker exec -i "$container_name" psql -X -Atq -v ON_ERROR_STOP=1 \
      -U postgres -d "$database_name")" || return
  [ "$marker" = space_members_state_check ] || {
    printf 'docker-proof: state-check precondition verdict failed\n' >&2
    return 1
  }
}
