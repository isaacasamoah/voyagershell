import json, statistics, sys, os
sys.path.insert(0, os.path.dirname(__file__)); import world
S = "/var/tmp/voyager-crew/scratch/voice/round2"
RUNS = [("LFM3-Audio-2B hearing the speech", "audio_results_audio.json"), ("LFM3-Audio-2B given the words", "audio_results_text.json"),
        ("LFM3-1.7B text, thinking off", "text17nothink_results.json"), ("LFM3-1.7B text, thinking on", "text17think_results.json")]
EXP = {}
for label, _, g_real, g_voice in world.REQUESTS:
    EXP[("real", label)] = g_real == "handoff"; EXP[("voice", label)] = (g_real if g_voice == "same" else g_voice) == "handoff"
def med(v): return round(statistics.median(v), 2) if v else None
def row(rs):
    act = [x for x in rs if not EXP[(x["surface"], x["label"])]]; hand = [x for x in rs if EXP[(x["surface"], x["label"])]]
    c = lambda L, o, r: sum(1 for x in L if x["outcome"] == o and x["retries"] == r)
    return {"actions": len(act), "right_first": c(act, "correct", 0), "right_after_retry": c(act, "correct", 1),
            "wrong_or_no_call": sum(1 for x in act if x["outcome"] in ("wrong", "invalid", "no call", "no call after retry")),
            "handed_off_instead": sum(1 for x in act if x["outcome"] == "handoff-missed"),
            "handoffs": len(hand), "handed_off_ok": sum(1 for x in hand if x["outcome"] == "handoff-ok"), "acted_instead": sum(1 for x in hand if x["outcome"] not in ("handoff-ok",)),
            "retries_used": sum(x["retries"] for x in rs),
            "t_to_call_med": med([x["t_call_s"] for x in rs if x["outcome"] in ("correct", "handoff-ok")]),
            "t_to_first_sound_med": med([x["t_first_sound_s"] for x in rs if x.get("t_first_sound_s")])}
out = {}
for name, f in RUNS:
    d = json.load(open(f"{S}/{f}"))
    for surf in ("real", "voice"): out[f"{name} | {surf}"] = row([x for x in d if x["surface"] == surf])
json.dump(out, open(S + "/summary.json", "w"), indent=1)
for k, v in out.items(): print(k, v)
