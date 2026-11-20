#!/usr/bin/env bash
R=/var/tmp/voyager-crew/scratch/voice/run.sh; H=~/the-workshop/bin/heavy; D=$(dirname "$(realpath "$0")"); L=/Users/isaac/.claude/jobs/d83b6243/tmp/lfm3-spike; O=/var/tmp/voyager-crew/scratch/voice/round2
$H perf -- $R $D/run3.py hf > $O/log3_hf.txt 2>&1
for mode in off on; do
 (LD_LIBRARY_PATH=$L/cuda-build/llama-b12242 nohup $L/cuda-build/llama-b12242/llama-server -m $L/LFM3-1.7B-Q4_K_M.gguf --jinja -ngl 99 --port 8099 -c 16384 --reasoning $mode > $O/llama3_$mode.log 2>&1 &)
 sleep 15
 RESULT_NAME=text17_$mode $R $D/run3.py llama > $O/log3_$mode.txt 2>&1
 pkill -f "llama-server.*8099"; sleep 3
done
echo done > $O/ALLDONE3
