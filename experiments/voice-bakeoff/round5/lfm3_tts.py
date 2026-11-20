import json, os, resource, statistics, subprocess, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import numpy as np, soundfile as sf, torch
from common import REPLIES
import talk_lfm3 as t

OUT = "/home/isaac/obsidian/Projects/voyagershellapp/research/voice-samples/female"
RAW = "/home/isaac/obsidian/Projects/voyagershellapp/research/voice-bakeoff-samples/round5"


def gpu_mb():
    return int(subprocess.check_output(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"]).decode().split()[0])


def rss_mb():
    return int(open("/proc/self/status").read().split("VmRSS:")[1].split()[0]) // 1024


def main():
    g0 = gpu_mb()
    model, proc, codec, dev = t.load()
    g1 = gpu_mb()
    rows = []
    made = []
    base = t.AudioOut
    class Spy(base):
        def __init__(self, *a, **k):
            super().__init__(*a, **k); made.append(self)
    t.speak_streaming.__globals__["AudioOut"] = Spy
    t.speak_streaming.__globals__["Player"] = type("Mute", (), {"__init__": lambda s: None, "write": lambda s, a: None, "close": lambda s: None})
    t.speak_streaming(model, proc, codec, dev, REPLIES[0].split(":")[0] + ".", "American English", "female")
    for i, s in enumerate(REPLIES[:5], 1):
        made.clear(); t0 = time.time()
        chunks, done_first_sentence = t.speak_streaming(model, proc, codec, dev, s, "American English", "female", t_end=t0)
        first = (made[0].t0 - t0) + made[0].first
        total = time.time() - t0
        w = np.concatenate(chunks)
        sf.write(f"{OUT}/lfm3-tts-female-{i}.wav", w, 24000)
        rows.append(dict(i=i, text=s, first_sound=first, total=total, seconds=len(w) / 24000))
    out = dict(rows=rows, first_sound_median=statistics.median(r["first_sound"] for r in rows), gpu_mb_added=g1 - g0, gpu_mb_peak_after=gpu_mb() - g0, rss_mb=rss_mb(), peak_rss_mb=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024)
    json.dump(out, open(f"{RAW}/lfm3_tts.json", "w"), indent=1)
    print(json.dumps(out, indent=1))


main()
