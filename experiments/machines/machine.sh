#!/bin/sh
set -eu
root=${MACHINES_EVIDENCE:-/var/tmp/voyager-crew/evidence/proto-machines}
side=$1
shift
dir=$root/$side
mkdir -p "$dir/home" "$dir/cfg" "$dir/state" "$dir/r"
chmod 700 "$dir/r"
exec env -u HC_SOCKET -u HC_SESSION -u HC_TERMINAL_ID -u HC_SCOPE -u HC_TERMINAL_SOCKET -u WAYLAND_DISPLAY -u DISPLAY \
  HOME="$dir/home" XDG_CONFIG_HOME="$dir/cfg" XDG_STATE_HOME="$dir/state" XDG_RUNTIME_DIR="$dir/r" \
  HC_SESSION=voyager-pm "$@"
