#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=${1:?usage: make.sh WORK_FOLDER}
tts=${EDGE_TTS:-edge-tts}
mkdir -p "$work"
: > "$work/replies.s16"
: > "$work/replies.tsv"
index=0
while IFS=$'\t' read -r kind voice words; do
  index=$((index + 1))
  name=$(printf '%s-%02d' "$kind" "$index")
  "$tts" --voice "$voice" --text "$words" --write-media "$work/$name.mp3"
  ffmpeg -loglevel error -y -i "$work/$name.mp3" -ar 16000 -ac 1 -f s16le -map_metadata -1 -fflags +bitexact -flags:a +bitexact "$work/$name.s16"
  samples=$(( $(stat -c %s "$work/$name.s16") / 2 ))
  cat "$work/$name.s16" >> "$work/replies.s16"
  printf '%s\t%s\t%s\t%s\n' "$name" "$kind" "$samples" "$words" >> "$work/replies.tsv"
done < "$here/sentences.tsv"
cp "$work/replies.s16" "$work/replies.tsv" "$here/"
