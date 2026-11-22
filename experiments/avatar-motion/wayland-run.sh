#!/usr/bin/env bash
set -euo pipefail
variant=${1:?variant folder holding voyager-shell and voyager}
label=${2:?run label}
levels=${3:-fleets,idle,streaming,builds}
root=$(cd "$(dirname "$0")/../.." && pwd)
scratch=${AVATAR_MOTION_SCRATCH:-/var/tmp/voyager-crew/scratch/avatar-motion}
out="$scratch/wayland/$label"
mkdir -p "$out"
CREW_ROOT=${CREW_ROOT:-/var/tmp/voyager-crew} CREW_NAME=${CREW_NAME:-experiment-avatar-motion} \
  "$HOME/the-workshop/bin/heavy" perf -- env -i HOME="$HOME" USER="$USER" AVM_SAMPLE="${AVM_SAMPLE:-}" AVM_HOG_NICE="${AVM_HOG_NICE:-}" PATH="/usr/bin:/bin:$HOME/.local/bin" \
  timeout 600 dbus-run-session -- python3 -I "$root/experiments/avatar-motion/wayland-drag.py" \
  "$variant/voyager-shell" "${VERIFIER:-$root/tests/native/target/debug/voyager-verification}" "$out" 2560x1600 555,330 "$levels" \
  > "$out/driver.log" 2>&1 || true
python3 -I "$root/experiments/avatar-motion/analyse.py" "$out" > "$out/summary.json"
echo "$out/summary.json"
