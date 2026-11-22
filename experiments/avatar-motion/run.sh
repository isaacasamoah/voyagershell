#!/usr/bin/env bash
set -euo pipefail
unset HC_SOCKET HC_SESSION HC_TERMINAL_ID HC_SCOPE HC_TERMINAL_SOCKET WAYLAND_DISPLAY DISPLAY
variant=${1:?variant folder holding voyager-shell and voyager}
label=${2:?run label}
root=$(cd "$(dirname "$0")/../.." && pwd)
scratch=${AVATAR_MOTION_SCRATCH:-/var/tmp/voyager-crew/scratch/avatar-motion}
verifier="$root/tests/native/target/debug/voyager-verification"
candidate="$variant/voyager-shell"
hc_path=${VOYAGER_VERIFY_HC:-$(command -v hc)}
evidence="$scratch/runs/$label"
mkdir -p "$scratch/runs"
CREW_ROOT=${CREW_ROOT:-/var/tmp/voyager-crew} CREW_NAME=${CREW_NAME:-experiment-avatar-motion} \
  "$HOME/the-workshop/bin/heavy" battery -- "$verifier" run --journey avatar-drag --probe frame \
  --binary "$candidate" --sha256 "$(sha256sum "$candidate" | cut -d' ' -f1)" \
  --hc-sha256 "$(sha256sum "$hc_path" | cut -d' ' -f1)" \
  --assets "$root/desktop/assets" --evidence "$evidence" || true
python3 -I "$root/experiments/avatar-motion/analyse.py" "$evidence" > "$evidence/summary.json"
echo "$evidence/summary.json"
