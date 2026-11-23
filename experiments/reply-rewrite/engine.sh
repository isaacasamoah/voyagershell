#!/bin/bash
set -u
here=$(dirname "$(realpath "$0")")
scratch=/var/tmp/voyager-crew/scratch/reply-rewrite
server=${VOYAGER_OMNI_SERVER:-/var/tmp/voyager-crew/toolchain/llama-b12242-cuda/llama-server}
snap=/home/isaac/.cache/huggingface/hub/models--LiquidAI--LFM3-Omni-2B-GGUF/snapshots/d508b88f08a5b4286f2d2805a6a8d69a0ff44c72
port=$(python3 -I -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
name=${1:-lfm}
sources=${2:-tn,mn,tn2,mn2}
"$server" -m "$snap/LFM3-Omni-2B-Q4_K_M.gguf" -mm "$snap/mmproj-LFM3-Omni-2B-Q4_K_M.gguf" --host 127.0.0.1 --port "$port" \
  --jinja --reasoning off --temp 0 -c 8192 -ngl "${VOYAGER_OMNI_GPU_LAYERS:-999}" > "$scratch/engine-$name.log" 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null; wait $pid 2>/dev/null' EXIT
for _ in $(seq 240); do
  curl -sf "http://127.0.0.1:$port/health" > /dev/null && break
  kill -0 $pid 2>/dev/null || { echo "engine exited"; exit 1; }
  sleep 0.5
done
curl -sf "http://127.0.0.1:$port/v1/chat/completions" -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Say hello."}],"max_tokens":8}' > /dev/null
python3 -I "$here/rewrite.py" llama "$port" "$name" "$sources"
