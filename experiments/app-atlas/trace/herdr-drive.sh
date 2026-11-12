#!/usr/bin/env bash
# Runs Herdr Core's pathways once, under strace, in a session that cannot touch
# the machine's own Core, Herdr or systemd:
# - a clean environment (env -i): no HC_* variables, no display or D-Bus;
# - HC_SESSION=atlas and private XDG_RUNTIME_DIR, XDG_STATE_HOME,
#   XDG_CONFIG_HOME and HOME under the run folder. A runtime folder other than
#   /run/user/<uid> makes Herdr start its Core directly instead of as a systemd
#   user service, so it never calls systemd-run or loginctl;
# - systemd-run, systemctl and loginctl shims first on PATH that only log and
#   fail, in case that ever changes;
# - a copy of the binary, so the Core and Holder run from the run folder.
# At the end it ends every program it started and stops this session's Core.
#
#   trace/herdr-drive.sh /var/tmp/hca-NAME /path/to/herdr-core
#
# Keep the run folder short (/var/tmp): Unix socket paths are limited to 108 bytes.
set -euo pipefail
RUN=$1
BIN=$2
HERE=$(cd "$(dirname "$0")" && pwd)
[ -e "$RUN" ] && { echo "$RUN exists; use a new run folder" >&2; exit 1; }
mkdir -p "$RUN"/{bin,shim,run,state,config,home,work}
chmod 700 "$RUN/run"
cp "$BIN" "$RUN/bin/herdr-core"
ln -s herdr-core "$RUN/bin/hc"
sha256sum "$RUN/bin/herdr-core" | cut -d' ' -f1 > "$RUN/binary.sha256"
for tool in systemd-run systemctl loginctl; do
  printf '#!/bin/sh\necho "%s $*" >> %s/shim.log\nexit 1\n' "$tool" "$RUN" > "$RUN/shim/$tool"
  chmod +x "$RUN/shim/$tool"
done

# The programs the pathways start. review behaves like an agent that reports
# its status with OSC 7501; parent starts its own reviewer, already working,
# and waits for it to finish.
cat > "$RUN/work/web.sh" <<'EOF'
i=0
while :; do i=$((i + 1)); echo "tick $i"; sleep 1; done
EOF
cat > "$RUN/work/review.sh" <<'EOF'
printf '\033]7501;state=%s\033\\' "${1:-idle}"
while IFS= read -r line; do
  printf '\033]7501;state=working\033\\'
  echo "review got: $line"
  sleep 1
  printf '\033]7501;state=done\033\\'
done
EOF
cat > "$RUN/work/parent.sh" <<EOF
printf '\033]7501;state=working\033\\\\'
hc run --bg --name review2 sh $RUN/work/review.sh working
hc wait review2 --timeout 40
echo "wait returned \$?"
printf '\033]7501;state=idle\033\\\\'
sleep 120
EOF

cat > "$RUN/work/inner.sh" <<EOF
set -u
cd $RUN/work
mark() { echo "MARK \$1" >> $RUN/marks; }
mark first-command-starts-core
hc run --bg --name web sh $RUN/work/web.sh
mark run-background
hc run --bg --name review sh $RUN/work/review.sh
sleep 2
mark app-connects
python3 -I $HERE/herdr_client.py connect web
mark attach-and-detach
python3 -I $HERE/herdr_client.py attach web
sleep 1
mark agent-sends-input
hc send review "Focus on the error path."
mark agent-sends-input-b1
hc keys review esc enter
sleep 2
mark status-and-wait
hc run --bg --name parent sh $RUN/work/parent.sh
sleep 4
hc send review2 "finish the review"
sleep 6
hc ls --json > $RUN/ls-before-restart.json
mark server-restart
hc server restart
hc ls --json > $RUN/ls-after-restart.json
sleep 1
mark cleanup
for t in parent review2 review web; do hc kill \$t || true; done
sleep 1
hc server status --json > $RUN/status-end.json || true
hc server stop || true
mark end
EOF

env -i \
  PATH="$RUN/shim:$RUN/bin:/usr/bin:/bin" \
  HOME="$RUN/home" TERM=xterm-256color LANG=C.UTF-8 \
  HC_SESSION=atlas \
  XDG_RUNTIME_DIR="$RUN/run" XDG_STATE_HOME="$RUN/state" XDG_CONFIG_HOME="$RUN/config" \
  strace -f -tt -s 400 -yy -o "$RUN/trace.log" \
    -e trace=execve,clone,clone3,fork,vfork,setsid,prctl,connect,accept,accept4,bind,read,write,readv,writev,recvfrom,sendto,recvmsg,sendmsg,openat,rename,ioctl,kill,exit_group \
    -e signal=none \
    bash "$RUN/work/inner.sh" > "$RUN/driver.log" 2>&1 &
TRACER=$!

# strace follows the Core and Holder, which outlive the driver. Wait for the
# driver's end mark, give the Holder its grace period to leave, then stop
# whatever of this run is still alive.
for _ in $(seq 1 240); do grep -q "MARK end" "$RUN/marks" 2>/dev/null && break; sleep 0.5; done
sleep 5
leftover=$(grep -l "HC_SESSION=atlas" /proc/[0-9]*/environ 2>/dev/null | while read -r f; do
  pid=${f#/proc/}; pid=${pid%/environ}
  exe=$(readlink "/proc/$pid/exe" 2>/dev/null || true)
  [ "$pid" = "$TRACER" ] && continue
  tr '\0' '\n' < "$f" 2>/dev/null | grep -qx "XDG_RUNTIME_DIR=$RUN/run" && echo "$pid:$exe"
done || true)
echo "${leftover:-none}" > "$RUN/leftover.txt"
for entry in $leftover; do kill "${entry%%:*}" 2>/dev/null || true; done
wait "$TRACER" || true
echo "done: $RUN (leftover processes: ${leftover:-none})"
