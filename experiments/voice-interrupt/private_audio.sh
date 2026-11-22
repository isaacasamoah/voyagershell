#!/bin/bash
set -e
S=/var/tmp/voyager-crew/scratch/voice-interrupt/pw/$(date +%s%N)
mkdir -p "$S/run" "$S/home"
exec /usr/bin/bwrap --unshare-user --unshare-pid --unshare-net --unshare-ipc --unshare-uts --die-with-parent --new-session \
  --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp --tmpfs /run/user \
  --bind /var/tmp/voyager-crew/scratch/voice-interrupt /var/tmp/voyager-crew/scratch/voice-interrupt \
  --unsetenv DBUS_SESSION_BUS_ADDRESS --unsetenv PULSE_SERVER --unsetenv PIPEWIRE_REMOTE \
  --setenv XDG_RUNTIME_DIR "$S/run" --setenv HOME "$S/home" \
  bash -c '
    pipewire >"$HOME/pipewire.log" 2>&1 & wireplumber >"$HOME/wp.log" 2>&1 & pipewire-pulse >"$HOME/pp.log" 2>&1 &
    for i in $(seq 50); do pactl info >/dev/null 2>&1 && break; sleep 0.1; done
    pactl load-module module-null-sink sink_name=speaker sink_properties=device.description=speaker >/dev/null
    pactl set-default-sink speaker
    eval "${PRIVATE_AUDIO_SETUP:-true}"
    pactl list short sinks
    "$@"' _ "$@"
