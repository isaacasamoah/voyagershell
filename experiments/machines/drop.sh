#!/bin/sh
set -eu
root=${MACHINES_EVIDENCE:-/var/tmp/voyager-crew/evidence/proto-machines}
for pid in $(pgrep -f "herdr-core connect"); do
  if tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null | grep -qx "HOME=$root/$1/home"; then
    kill "$pid"
    echo "dropped $pid at $(date +%T.%N)"
  fi
done
