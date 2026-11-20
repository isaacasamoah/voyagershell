import json, os, statistics, subprocess, sys, threading, time
import numpy as np, soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import detectors as D

S = "/var/tmp/voyager-crew/scratch/voice/round6"
RATE = 16000


def gpu_sampler(stop, out):
    while not stop.is_set():
        r = subprocess.run(["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"], capture_output=True, text=True)
        try: out.append(float(r.stdout.split()[0]))
        except Exception: pass
        time.sleep(0.2)


def pct(v, q):
    v = sorted(v)
    return round(v[min(len(v) - 1, int(round(q * (len(v) - 1))))], 3) if v else None


def main():
    only = sys.argv[1].split(",") if len(sys.argv) > 1 else None
    cases = json.load(open(S + "/cases.json"))
    sil, st = D.Silero(), D.SmartTurn(); om = D.Omni()
    names = ["rule_0.6", "rule_1.0", "rule_1.5", "vad_0.6", "vad_1.0", "smart_turn", "omni"]
    if only: names = [n for n in names if n in only]
    res = {n: [] for n in names}
    cpu = {n: 0.0 for n in names + ["silero"]}
    audio_s = 0.0
    gpu = []; stop = threading.Event()
    for c in cases:
        a, _ = sf.read(f"{S}/set/{c['file']}", dtype="int16"); audio_s += len(a) / RATE
        t0 = time.process_time(); vp = sil.probs(a); cpu["silero"] += time.process_time() - t0
        for n in names:
            t0 = time.process_time()
            if n.startswith("rule"): t, why, spent = D.run_rule(a, int(float(n.split("_")[1]) / 0.02)); calls = 0
            elif n.startswith("vad"): t, why, spent = D.run_vad_hangover(vp, float(n.split("_")[1])); calls = 0
            else:
                if n == "omni":
                    th = threading.Thread(target=gpu_sampler, args=(stop, gpu), daemon=True)
                    if not th.is_alive() and not stop.is_set() and not getattr(main, "g", False): th.start(); main.g = True
                t, why, spent, calls = D.run_model(a, vp, st if n == "smart_turn" else om)
            cpu[n] += time.process_time() - t0
            res[n].append({"case": c["name"], "kind": c["kind"], "fire": round(t, 3), "why": why, "true_end": c["true_end"], "early": t < c["true_end"] - 1e-6, "late": round(t - c["true_end"], 3), "infer_s": round(spent, 3), "calls": calls})
        print(c["name"], {n: (res[n][-1]["early"], res[n][-1]["late"]) for n in names}, flush=True)
    stop.set()
    summ = {}
    for n in names:
        rows = res[n]; summ[n] = {}
        for kind in [None, "plain", "pause", "pausew", "click", "hmm"]:
            sub = [r for r in rows if kind is None or r["kind"] == kind]
            ok = [r["late"] for r in sub if not r["early"]]
            summ[n][kind or "all"] = {"cases": len(sub), "early": sum(r["early"] for r in sub), "late_median": pct(ok, .5), "late_p90": pct(ok, .9)}
        inf = [r["infer_s"] / r["calls"] for r in rows if r["calls"]]
        summ[n]["calls_per_case"] = round(statistics.mean(r["calls"] for r in rows), 2)
        summ[n]["infer_median_s"] = round(statistics.median(inf), 3) if inf else None
        summ[n]["cpu_s_per_audio_s"] = round(cpu[n] / audio_s, 5)
    summ["silero_cpu_s_per_audio_s"] = round(cpu["silero"] / audio_s, 5)
    summ["gpu_util_during_run"] = {"mean": round(statistics.mean(gpu), 1), "max": max(gpu)} if gpu else None
    suffix = "-" + "-".join(only) if only else ""
    json.dump({"summary": summ, "rows": res}, open(f"{S}/results{suffix}.json", "w"), indent=1)
    print(json.dumps(summ, indent=1))


if __name__ == "__main__":
    main()
