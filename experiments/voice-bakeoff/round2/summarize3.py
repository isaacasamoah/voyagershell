import json, statistics
S = "/var/tmp/voyager-crew/scratch/voice/round2"
H = lambda l: l.startswith(("handoff", "create voyage"))
a = json.load(open(S + "/r3_audio2b.json")); on = json.load(open(S + "/r3_text17_on.json"))["rows"]; off = json.load(open(S + "/r3_text17_off.json"))["rows"]
om = json.load(open(S + "/r3_omni.json"))
PATHS = {"LFM3-Omni-2B hears speech (end to end)": om["audio"], "LFM3-Omni-2B hears, Omni calls": om["hear_then_call"], "LFM3-Audio-2B hears speech (end to end)": a["audio"], "LFM3 hears, LFM3-Audio-2B calls": a["hear_then_call"], "LFM3 hears, LFM3-1.7B calls, thinking off": off, "LFM3 hears, LFM3-1.7B calls, thinking on": on}
out = {}
for name, rows in PATHS.items():
    per = []
    for run in range(3):
        rs = [r for r in rows if r["run"] == run]; act = [r for r in rs if not H(r["label"])]; hand = [r for r in rs if H(r["label"])]
        per.append({"right": sum(r["outcome"] == "correct" for r in act), "right_first": sum(r["outcome"] == "correct" and r["retries"] == 0 for r in act),
                    "asked_or_handed_off": sum(r["outcome"] in ("asked", "handoff-missed") for r in act), "wrong_target": sum(r["outcome"] == "wrong-target" for r in act),
                    "no_valid_call": sum(r["outcome"] in ("no call", "gave up") for r in act),
                    "handoff_ok": sum(r["outcome"] == "handoff-ok" for r in hand), "acted_on_handoff": sum(r["outcome"] == "wrong-effect" for r in hand),
                    "handoff_other": sum(r["outcome"] not in ("handoff-ok", "wrong-effect") for r in hand), "n_act": len(act), "n_hand": len(hand),
                    "t_med": round(statistics.median([r["t_call_s"] for r in rs if r["outcome"] in ("correct", "handoff-ok")] or [0]), 2), "retries": sum(r["retries"] for r in rs)})
    out[name] = per
json.dump(out, open(S + "/r3_summary.json", "w"), indent=1)
for k, per in out.items():
    f = lambda key: f"{min(p[key] for p in per)}-{max(p[key] for p in per)}"
    print(k, "| right", [p["right"] for p in per], "first", [p["right_first"] for p in per], "of", per[0]["n_act"], "| wrongtarget", f("wrong_target"), "asked/handoff", f("asked_or_handed_off"), "nocall", f("no_valid_call"), "| handoff ok", f("handoff_ok"), "of", per[0]["n_hand"], "acted", f("acted_on_handoff"), "| t", [p["t_med"] for p in per], "retries", f("retries"))
