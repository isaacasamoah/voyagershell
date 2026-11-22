import glob, json, os, sys, time
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import RATE, FRAME, SCRATCH, Silero, load, START_PROBABILITY, SPEAKING_PROBABILITY, ONSET_FRAMES, LEAD_FRAMES

FS = FRAME / RATE


class SmartTurn:
    def __init__(self):
        import onnxruntime as ort
        from transformers import WhisperFeatureExtractor
        p = glob.glob(os.path.expanduser("~/.cache/huggingface/hub/models--pipecat-ai--smart-turn-v3/snapshots/*/smart-turn-v3.2-cpu.onnx"))[0]
        so = ort.SessionOptions(); so.intra_op_num_threads = 1; so.inter_op_num_threads = 1
        self.s = ort.InferenceSession(p, so, providers=["CPUExecutionProvider"])
        self.fe = WhisperFeatureExtractor(chunk_length=8)
        self.spent = []

    def __call__(self, audio):
        t0 = time.perf_counter()
        x = audio[-8 * RATE:].astype(np.float32)
        x = np.pad(x, (8 * RATE - len(x), 0))
        f = self.fe(x, sampling_rate=RATE, return_tensors="np", padding="max_length", max_length=8 * RATE,
                    truncation=True, do_normalize=True).input_features.astype(np.float32)
        p = float(self.s.run(None, {"input_features": f})[0].reshape(-1)[0])
        self.spent.append(time.perf_counter() - t0)
        return p


def probs(a, det):
    det.reset()
    return [det.probability(a[k:k + FRAME]) for k in range(0, len(a) - FRAME + 1, FRAME)]


def run(p, a, quiet_end, judge=None, first=0.2, thr=0.5, every=None, cache=None):
    run_ = 0; speaking = False; quiet = 0; start = None; last = None
    for k, x in enumerate(p):
        t = (k + 1) * FS
        if not speaking:
            run_ = run_ + 1 if x >= START_PROBABILITY else 0
            if run_ >= ONSET_FRAMES:
                speaking = True; quiet = 0; start = max(0, k + 1 - run_ - LEAD_FRAMES)
            continue
        quiet = 0 if x >= SPEAKING_PROBABILITY else quiet + 1
        if quiet == 0:
            last = None
        qs = quiet * FS
        if judge is not None and quiet > 0:
            due = (last is None and qs >= first - 1e-9) or (every and last is not None and qs - last >= every - 1e-9)
            if due:
                last = qs
                key = (start, k)
                if key not in cache:
                    cache[key] = judge(a[start * FRAME:(k + 1) * FRAME])
                if cache[key] >= thr:
                    return t
        if qs >= quiet_end - 1e-9:
            return t
    return None


def main():
    cases = json.load(open(os.path.join(SCRATCH, "audio", "eot", "cases.json")))
    det = Silero(); st = SmartTurn()
    configs = [("silence", T, None, None, None) for T in (0.8, 1.0, 1.5, 2.0, 2.5, 3.0)]
    for first in (0.2, 0.5):
        for thr in (0.5, 0.7, 0.9):
            for fallback in (2.0, 3.0):
                for every in (None, 0.5):
                    configs.append(("smart", fallback, first, thr, every))
    out = []
    for c in cases:
        a = load(os.path.join(SCRATCH, "audio", "eot", c["name"] + ".wav"))
        p = probs(a, det); cache = {}
        res = {}
        for kind, T, first, thr, every in configs:
            name = f"silence-{T}" if kind == "silence" else f"smart-first{first}-thr{thr}-fb{T}" + ("-every0.5" if every else "")
            t = run(p, a, T) if kind == "silence" else run(p, a, T, st, first, thr, every, cache)
            res[name] = None if t is None else round(t - c["true_end"], 3)
        out.append({**c, "ends": res})
    summary = {}
    for name in out[0]["ends"]:
        rows = {}
        for group, sel in [("all", lambda c: True), ("whole", lambda c: c["kind"] == "whole"), ("paused", lambda c: c["kind"] == "paused")] + \
                [(f"pause{pz}", (lambda pz: lambda c: c["pause"] == pz)(pz)) for pz in (0.5, 1.0, 1.5, 2.0, 3.0)] + \
                [(f"form-{f}", (lambda f: lambda c: c["form"] == f and c["kind"] == "paused")(f)) for f in ("hesitate", "trail", "continue")]:
            g = [c for c in out if sel(c)]
            d = [c["ends"][name] for c in g]
            early = sum(x is not None and x < -0.05 for x in d)
            late = [x for x in d if x is not None and x >= -0.05]
            rows[group] = {"cases": len(g), "early": early, "late_median": round(float(np.median(late)), 3) if late else None,
                           "late_p90": round(float(np.percentile(late, 90)), 3) if late else None, "none": sum(x is None for x in d)}
        summary[name] = rows
    spent = st.spent
    json.dump({"summary": summary, "smart_turn_calls": len(spent), "smart_turn_ms_median": round(1000 * float(np.median(spent)), 1),
               "cases": out}, open(sys.argv[1], "w"), indent=1)
    for name, r in summary.items():
        print(f"{name:40s} early {r['all']['early']:3d}/{r['all']['cases']}  paused-early {r['paused']['early']:3d}/{r['paused']['cases']}  whole-early {r['whole']['early']}  late med {r['all']['late_median']} p90 {r['all']['late_p90']}")
    print("smart turn ms median", round(1000 * float(np.median(spent)), 1), "calls", len(spent))


if __name__ == "__main__":
    main()
