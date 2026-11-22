import json, subprocess, sys, threading, time
import numpy as np

RATE = 24000
TRIALS = int(sys.argv[1]) if len(sys.argv) > 1 else 20
OUT = sys.argv[2]
LATENCY_MS = sys.argv[3] if len(sys.argv) > 3 else "40"


def tone(seconds):
    t = np.arange(int(seconds * RATE)) / RATE
    return (0.3 * np.sin(2 * np.pi * 440 * t) * 32767).astype(np.int16).tobytes()


def trial(k):
    rec = subprocess.Popen(["parec", "--raw", "--format=s16le", f"--rate={RATE}", "--channels=1", "--latency-msec=5",
                            "--device=speaker.monitor"], stdout=subprocess.PIPE)
    got = bytearray()

    def read():
        while True:
            b = rec.stdout.read(240)
            if not b:
                return
            got.extend(b)
    threading.Thread(target=read, daemon=True).start()
    time.sleep(0.5)
    marks = {"start": len(got) // 2}
    play = subprocess.Popen(["paplay", "--raw", "--format=s16le", f"--rate={RATE}", "--channels=1", f"--latency-msec={LATENCY_MS}",
                             "--client-name=voyager-voice", "--stream-name=voyager-voice"], stdin=subprocess.PIPE)

    def feed():
        try:
            play.stdin.write(tone(6)); play.stdin.flush()
        except (BrokenPipeError, ValueError):
            pass
    threading.Thread(target=feed, daemon=True).start()
    time.sleep(1.5 + 0.037 * k)
    marks["kill"] = len(got) // 2
    t0 = time.perf_counter(); play.kill(); play.wait(); wait_s = time.perf_counter() - t0
    time.sleep(0.6)
    rec.kill(); rec.wait()
    a = np.frombuffer(bytes(got[: len(got) // 2 * 2]), np.int16).astype(np.float32)
    loud = np.where(np.abs(a) > 1000)[0]
    first, last = int(loud[0]), int(loud[-1])
    return {"start_to_sound_ms": round((first - marks["start"]) / RATE * 1000, 1),
            "kill_to_silence_ms": round((last - marks["kill"]) / RATE * 1000, 1),
            "kill_wait_ms": round(wait_s * 1000, 2)}


rows = [trial(k) for k in range(TRIALS)]
s = [r["kill_to_silence_ms"] for r in rows]
summary = {"paplay_latency_msec": LATENCY_MS, "trials": TRIALS, "kill_to_silence_ms_median": float(np.median(s)),
           "p90": float(np.percentile(s, 90)), "max": max(s), "min": min(s),
           "start_to_sound_ms_median": float(np.median([r["start_to_sound_ms"] for r in rows]))}
json.dump({"summary": summary, "rows": rows}, open(OUT, "w"), indent=1)
print(json.dumps(summary))
