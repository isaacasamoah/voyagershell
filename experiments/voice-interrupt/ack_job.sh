#!/bin/bash
D=/Users/isaac/.cache/huggingface/hub/models--LiquidAI--LFM3-Omni-2B-GGUF/snapshots/d508b88f08a5b4286f2d2805a6a8d69a0ff44c72
L=/var/tmp/voyager-crew/toolchain/llama-b12242-cuda
S=/var/tmp/voyager-crew/scratch/voice-interrupt
LD_LIBRARY_PATH=$L $L/llama-server -m $D/LFM3-Omni-2B-Q4_K_M.gguf -mm $D/mmproj-LFM3-Omni-2B-Q4_K_M.gguf --host 127.0.0.1 --port 8131 --jinja --reasoning off --temp 0 -c 8192 -ngl 999 > $S/runs/omni-8131.log 2>&1 &
PID=$!
trap 'kill $PID; wait $PID' EXIT
for i in $(seq 120); do curl -sf http://127.0.0.1:8131/health >/dev/null && break; sleep 0.5; done
OMNI_PORT=8131 /var/tmp/voyager-crew/scratch/voice/venv/bin/python -I "$@"
