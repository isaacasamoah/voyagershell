#!/bin/bash
set -u
NAME="$1" VARIANT="$2" SET="$3"
R=/var/tmp/voyager-crew/scratch/voice-spoken-r2
S=/var/tmp/voyager-crew/scratch/model-tiers/exp0
O=/var/tmp/voyager-crew/scratch/voice-spoken-style/eval-set
B=$S/batch-$NAME
C=/home/isaac/.local/share/fnm/node-versions/v24.13.1/installation/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe
SESSION=voyager-mt$NAME
UUID=$(python3 -c 'import uuid;print(uuid.uuid4())')
RT=$S/rt/$NAME
if [ -e "$B" ] || [ -e "$RT" ]; then echo "batch $NAME already exists"; exit 2; fi
mkdir -p "$B/work" "$B/bin" "$RT" "$B/out"
cp "$R/bin/voyager-$VARIANT" "$B/bin/voyager"
sed "s|__WORLD__|$R/worlds/$SET.json|" "$R/harness/hc" > "$B/bin/hc"; chmod +x "$B/bin/hc"
echo "$UUID" > "$B/session-id"; echo "$VARIANT $SET ${MODEL:-claude-sonnet-5-5} ${EFFORT:-low}" > "$B/variant"
sha256sum /Users/isaac/.claude/settings.json /Users/isaac/.claude/settings.local.json 2>/dev/null > "$B/hashes-before.txt"
SD=$RT/herdr-core/$SESSION.vessels
STATUS_BIN=$R/bin/overview-dump python3 -I "$R/harness/stub_app.py" "$SESSION" t1 "$SD" "$R/worlds/$SET.json" "$B/stub.log" &
STUB=$!
trap 'kill $STUB 2>/dev/null' EXIT
sleep 1
if ! env -i HOME="$HOME" PATH=/usr/bin XDG_RUNTIME_DIR="$RT" HC_SESSION="$SESSION" HC_TERMINAL_ID=t1 "$B/bin/voyager" status > "$B/status-check.txt" 2>&1; then
  echo "the stand-in app is not answering; stopping before any Claude turn"
  exit 3
fi
echo '{"kind":"workspace"}' > "$SD/control"
LAUNCH=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["launch"])' "$O/harness/trial-launch.json")
SETTINGS=$(python3 -c 'import json,sys;print(json.dumps({"env":{"VOYAGER_BACKGROUND":"1"},"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":sys.argv[1]+" focus --hook claude"}]}]}}))' "$B/bin/voyager")
run() {
  local mode="$1" id="$2" out="$3" prompt="$4"
  local T0; T0=$(python3 -c "import time;print(time.time())")
  printf '%s' "$prompt" | (cd "$B/work" && env -i HOME="$HOME" USER="$USER" LANG=C.UTF-8 TERM=xterm-256color \
    PATH="$B/bin:/usr/bin:/bin" XDG_RUNTIME_DIR="$RT" KILL_LOG="$B/kill.log" \
    HC_SESSION="$SESSION" HC_TERMINAL_ID=t1 HC_SOCKET="$RT/no-core.sock" SCRATCH_LOG="$B/hc.log" \
    "$C" -p --output-format stream-json --verbose --include-partial-messages --model "${MODEL:-claude-sonnet-5-5}" --effort "${EFFORT:-low}" "$mode" "$id" -n voyager \
      --append-system-prompt "$LAUNCH" --settings "$SETTINGS" \
      --permission-mode dontAsk --allowedTools "Bash(voyager *),Bash(voyager),Bash(hc *),Bash(grep *),Bash(head *),Bash(head),Bash(tail *),Bash(tail),Bash(jq *),Bash(echo *)" \
      --disallowedTools "Bash(*/hc *),Bash(*/voyager *)") 2> "$out.err" | python3 -I "$S/harness/stamp.py" "$T0" "${out%.json}.stream.jsonl" "$out"
}
run --session-id "$UUID" "$B/out/seed.json" "Hello. I'm about to start using voice."
if [ "$SET" = trial ]; then
  python3 -c 'import json,sys;[print("normal\t"+t["prompt"]) for t in json.load(open(sys.argv[1]))]' "$O/turns.json" > "$B/prompts.tsv"
  [ "${EXTRAS:-1}" = 1 ] && cat "$O/harness/extras.tsv" >> "$B/prompts.tsv"
else
  python3 -c 'import json,sys;[print("normal\t"+t["prompt"].replace("\n"," ")) for t in json.load(open(sys.argv[1]))]' "$R/$SET-turns.json" > "$B/prompts.tsv"
fi
n=0
while IFS=$'\t' read -r mode prompt; do
  n=$((n+1))
  echo "$mode" > "$SD/mode"
  run --resume "$UUID" "$B/out/turn-$(printf %02d $n).json" "$prompt"
  echo "turn $n exit $? mode $mode"
done < <(head -n "${LIMIT:-999}" "$B/prompts.tsv")
echo normal > "$SD/mode"
case "$UUID" in ([0-9a-f]*-*-*-*-*) ;; (*) echo "no session id; nothing removed"; exit 4;; esac
D=/Users/isaac/.claude/projects/$(echo "$B/work" | sed 's|[/.]|-|g')
case "$D" in (/Users/isaac/.claude/projects/-var-tmp-voyager-crew-scratch-model-tiers-exp0-batch-*-work) ;; (*) echo "unexpected project folder $D; nothing removed"; exit 4;; esac
J="${D:?}/${UUID:?}.jsonl"
if [ -f "$J" ]; then
  echo "hook lines with the guide: $(grep -c 'Talk like a friend who knows this system' "$J"), with What matters: $(grep -c 'Give the gist, not the inventory' "$J"), with pairs: $(grep -c 'Not this, but this' "$J")" > "$B/transcript-check.txt"
  python3 -I -c '
import json,sys
out=open(sys.argv[2],"w")
for line in open(sys.argv[1]):
    try: r=json.loads(line)
    except Exception: continue
    c=(r.get("message") or {}).get("content")
    if not isinstance(c,list): continue
    for b in c:
        if isinstance(b,dict) and b.get("type")=="tool_use":
            out.write(json.dumps({"ts":r.get("timestamp"),"input":b.get("input")})+"\n")
' "$J" "$B/tool-calls.jsonl"
  echo "removing: $J" >> "$B/removed.txt"
  rm -f -- "${D:?}/${UUID:?}.jsonl"
fi
for f in "${D:?}"/*.jsonl; do [ -e "$f" ] && echo "unexpected: $f"; done
if [ -d "${D:?}/${UUID:?}" ]; then find "${D:?}/${UUID:?}" -type f | sed 's/^/removing: /' >> "$B/removed.txt"; find "${D:?}/${UUID:?}" -type f -exec rm -f -- {} \; ; find "${D:?}/${UUID:?}" -depth -type d -exec rmdir -- {} \; ; fi
[ -d "${D:?}/memory" ] && rmdir -- "${D:?}/memory"
[ -d "${D:?}" ] && rmdir -- "${D:?}"
E="/Users/isaac/.claude/session-env/${UUID:?}"
if [ -d "$E" ]; then find "$E" -maxdepth 1 -type f | sed 's/^/removing: /' >> "$B/removed.txt"; find "$E" -maxdepth 1 -type f -exec rm -f -- {} \; ; rmdir -- "$E"; fi
find /Users/isaac/.claude -path "*${UUID:?}*" 2>/dev/null | sed 's/^/left: /'
sha256sum /Users/isaac/.claude/settings.json /Users/isaac/.claude/settings.local.json 2>/dev/null > "$B/hashes-after.txt"
cmp -s "$B/hashes-before.txt" "$B/hashes-after.txt" && echo "settings unchanged" || echo "SETTINGS CHANGED"
echo "batch $NAME done"
