#!/usr/bin/env bash
set -u
R=/var/tmp/voyager-crew/scratch/voice/run.sh; H=~/the-workshop/bin/heavy; D=$(dirname "$(realpath "$0")"); L=/Users/isaac/.claude/jobs/d83b6243/tmp/lfm3-spike
RESULT_NAME=text17nothink $R $D/run_llama.py > /var/tmp/voyager-crew/scratch/voice/round2/log_nothink.txt 2>&1
INPUT=audio $H perf -- $R $D/run_audio.py > /var/tmp/voyager-crew/scratch/voice/round2/log_audio.txt 2>&1
INPUT=text $H perf -- $R $D/run_audio.py > /var/tmp/voyager-crew/scratch/voice/round2/log_audiotext.txt 2>&1
pkill -f "llama-server.*8099"; sleep 3
(LD_LIBRARY_PATH=$L/cuda-build/llama-b12242 nohup $L/cuda-build/llama-b12242/llama-server -m $L/LFM3-1.7B-Q4_K_M.gguf --jinja -ngl 99 --port 8099 -c 16384 --reasoning on > /var/tmp/voyager-crew/scratch/voice/llama17on.log 2>&1 &)
sleep 15
RESULT_NAME=text17think $R $D/run_llama.py > /var/tmp/voyager-crew/scratch/voice/round2/log_think.txt 2>&1
pkill -f "llama-server.*8099"
echo finished > /var/tmp/voyager-crew/scratch/voice/round2/ALLDONE
