import json, sys

FIELDS = ["offer", "narration", "mechanics", "wrong", "unasked_action"]


def unblind(folder, labels):
    key = {r["turn"]: r for r in json.load(open(f"{folder}/key.json"))}
    out = {}
    for row in json.load(open(f"{folder}/{labels}")):
        for label, batch in key[row["turn"]].items():
            if label != "turn" and label in row:
                out[(batch, row["turn"])] = row[label]
    return out


def compare(a, b, title):
    shared = sorted(set(a) & set(b))
    print(f"{title}: replies in both {len(shared)}")
    for f in FIELDS:
        both = sum(1 for k in shared if bool(a[k].get(f)) == bool(b[k].get(f)))
        p1 = sum(1 for k in shared if a[k].get(f)) / len(shared)
        p2 = sum(1 for k in shared if b[k].get(f)) / len(shared)
        po = both / len(shared)
        pe = p1 * p2 + (1 - p1) * (1 - p2)
        kappa = (po - pe) / (1 - pe) if pe < 1 else 1.0
        split = [f"{k[0]}:{k[1]} first={bool(a[k].get(f))}" for k in shared if bool(a[k].get(f)) != bool(b[k].get(f))]
        print(json.dumps({"field": f, "agree": f"{both}/{len(shared)}", "kappa": round(kappa, 2), "yes": [round(p1 * len(shared)), round(p2 * len(shared))], "splits": split}))


S = "/var/tmp/voyager-crew/scratch/model-tiers/exp0/score"
R = "/var/tmp/voyager-crew/scratch/voice-spoken-r2/score"
opus = {**unblind(f"{S}/trial", "labels-claude-opus-5-5.json"), **unblind(f"{S}/morning", "labels-claude-opus-5-5.json")}
fable = {**unblind(f"{S}/trial-fable", "labels-claude-fable-5-2.json"), **unblind(f"{S}/morning-fable", "labels-claude-fable-5-2.json")}
compare(opus, fable, "Opus vs Fable, blind sample")
old = {**unblind(f"{R}/q2-trial-r1", "labels-claude-opus-5-5.json"), **unblind(f"{R}/q2-morning-r1", "labels-claude-opus-5-5.json")}
old = {k: v for k, v in old.items() if k[0] in ("tn", "mn")}
compare(opus, old, "this Opus relabel vs round 2 Opus, baseline batches")
