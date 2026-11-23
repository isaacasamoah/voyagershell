import json, os, random, re, statistics, subprocess, sys
from pathlib import Path

SOURCE = Path("/var/tmp/voyager-crew/scratch/voice-spoken-r2")
SCRATCH = Path("/var/tmp/voyager-crew/scratch/reply-rewrite")
HERE = Path(__file__).parent
CLAUDE = "/home/isaac/.local/share/fnm/node-versions/v24.13.1/installation/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe"
STYLE = ["offer", "narration", "mechanics", "wrong", "unasked_action"]
FIDELITY = ["added", "changed", "dropped", "meaning"]
SETS = {
    "trial-r1": ("t0", "tn", "ground-truth-trial.md"),
    "morning-r1": ("m0", "mn", "ground-truth-morning.md"),
    "trial-r2": ("t02", "tn2", "ground-truth-trial.md"),
    "morning-r2": ("m02", "mn2", "ground-truth-morning.md"),
}
REWRITERS = ["lfm", "haiku", "sonnet"]


def folder_of(batch):
    local = SCRATCH / f"batch-{batch}"
    return local if local.exists() else SOURCE / f"batch-{batch}"


def clean(text):
    return re.sub(r"^\s*(\[vy\]|oru:)\s*", "", text or "").strip()


def reply(batch, n):
    path = folder_of(batch) / "out" / f"turn-{n:02d}.json"
    if n < 1 or not path.exists():
        return ""
    try:
        return clean(json.load(open(path)).get("result"))
    except ValueError:
        return ""


def timing(batch, n):
    path = folder_of(batch) / "out" / f"turn-{n:02d}.json"
    return json.load(open(path)).get("timing") if path.exists() else None


def prompts(batch):
    return [line.rstrip("\n").split("\t", 1)[1] for line in open(folder_of(batch) / "prompts.tsv") if line.strip()]


def columns(name):
    base, an, _ = SETS[name]
    return [base, an] + [f"{r}-{an}" for r in REWRITERS]


def sample(name):
    lines = (SOURCE / "score" / "second-sample.txt").read_text().split()
    return set(int(x) for x in lines[0 if name.startswith("trial") else 1].split(","))


def build_style(name, seed, only=None):
    out = SCRATCH / "score" / (name + ("-fable" if only else ""))
    out.mkdir(parents=True, exist_ok=True)
    rng = random.Random(seed)
    sheet, key = [], []
    batches = columns(name)
    for n, said in enumerate(prompts(batches[1]), 1):
        if only and n not in only:
            continue
        order = list(batches)
        rng.shuffle(order)
        labels = "VWXYZ"
        sheet.append({"turn": n, "prompt": said, "replies": {l: {"previous_reply_in_its_conversation": reply(b, n - 1), "reply": reply(b, n)} for l, b in zip(labels, order)}})
        key.append({"turn": n, **dict(zip(labels, order))})
    json.dump(sheet, open(out / "sheet.json", "w"), indent=1)
    json.dump(key, open(out / "key.json", "w"), indent=1)
    return out


def build_fidelity(name, seed, only=None):
    out = SCRATCH / "score" / ("fid-" + name + ("-fable" if only else ""))
    out.mkdir(parents=True, exist_ok=True)
    rng = random.Random(seed)
    an = SETS[name][1]
    sheet, key = [], []
    for n, said in enumerate(prompts(an), 1):
        if only and n not in only:
            continue
        order = [f"{r}-{an}" for r in REWRITERS]
        rng.shuffle(order)
        sheet.append({"turn": n, "prompt": said, "original": reply(an, n), "rewrites": {l: reply(b, n) for l, b in zip("ABC", order)}})
        key.append({"turn": n, **dict(zip("ABC", order))})
    json.dump(sheet, open(out / "sheet.json", "w"), indent=1)
    json.dump(key, open(out / "key.json", "w"), indent=1)
    return out


def judge(folder, brief, truth, model):
    folder = Path(folder)
    reads = f"{brief}, {truth} and {folder}/sheet.json" if truth else f"{brief} and {folder}/sheet.json"
    task = (f"You are an independent labeller. Follow {brief} for the folder {folder}" + (f", with the ground-truth file {truth}" if truth else "") +
            f". Read only {reads}, and reply with only the JSON array the brief describes.")
    env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "HC_SOCKET", "HC_SESSION", "HC_TERMINAL_ID", "HC_SCOPE", "HC_TERMINAL_SOCKET")}
    run = subprocess.run([CLAUDE, "-p", "--model", model, "--permission-mode", "dontAsk", "--allowedTools", "Read", "--no-session-persistence", "--output-format", "json", task],
                         cwd=folder, env=env, capture_output=True, text=True, timeout=3600)
    (folder / f"judge-{model}.json").write_text(run.stdout)
    text = json.loads(run.stdout).get("result") or ""
    labels = json.loads(text[text.find("["): text.rfind("]") + 1])
    json.dump(labels, open(folder / f"labels-{model}.json", "w"), indent=1)


def unblind(folder, model):
    folder = Path(folder)
    key = {r["turn"]: r for r in json.load(open(folder / "key.json"))}
    out = {}
    for row in json.load(open(folder / f"labels-{model}.json")):
        for label, batch in key[row["turn"]].items():
            if label != "turn" and label in row:
                out[(batch, row["turn"])] = row[label]
    return out


def column_kind(batch):
    if batch in ("t0", "m0", "t02", "m02"):
        return "baseline"
    if "-" in batch:
        return batch.split("-")[0]
    return "An"


def percentile(values, q):
    values = sorted(values)
    if not values:
        return None
    k = (len(values) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(values) - 1)
    return round(values[lo] + (values[hi] - values[lo]) * (k - lo), 2)


def totals(model):
    style, fid = {}, {}
    for name in SETS:
        style.update(unblind(SCRATCH / "score" / name, model))
        path = SCRATCH / "score" / f"fid-{name}"
        if (path / f"labels-{model}.json").exists():
            fid.update(unblind(path, model))
    table = {}
    for name in SETS:
        for batch in columns(name):
            kind = column_kind(batch)
            row = table.setdefault(kind, {f: [] for f in STYLE + FIDELITY} | {"words": [], "done": [], "first": [], "turns": 0})
            for n in range(1, len(prompts(batch)) + 1):
                row["turns"] += 1
                row["words"].append(len(reply(batch, n).split()))
                labels = style.get((batch, n), {})
                for f in STYLE:
                    if labels.get(f):
                        row[f].append(f"{batch}:{n}")
                for f in FIDELITY:
                    if fid.get((batch, n), {}).get(f):
                        row[f].append(f"{batch}:{n}")
                t = timing(batch, n) if "-" in batch else None
                if t:
                    row["done"].append(t["done_s"])
                    row["first"].append(t["first_sentence_s"])
    for kind, row in table.items():
        print(json.dumps({"column": kind, "turns": row["turns"], **{f: len(row[f]) for f in STYLE + FIDELITY},
                          "median_words": statistics.median(row["words"]), "mean_words": round(statistics.mean(row["words"]), 1),
                          "done_p50": percentile(row["done"], 0.5), "done_p90": percentile(row["done"], 0.9),
                          "first_sentence_p50": percentile(row["first"], 0.5), "first_sentence_p90": percentile(row["first"], 0.9),
                          "where": {f: row[f] for f in STYLE + FIDELITY if row[f]}}))


def agree(primary, second, kind):
    fields = STYLE if kind == "style" else FIDELITY
    names = list(SETS)[:2]
    a, b = {}, {}
    for name in names:
        prefix = "" if kind == "style" else "fid-"
        a.update(unblind(SCRATCH / "score" / f"{prefix}{name}", primary))
        b.update(unblind(SCRATCH / "score" / f"{prefix}{name}-fable", second))
    shared = sorted(set(a) & set(b))
    print(f"{kind}: replies labelled by both: {len(shared)}")
    for field in fields:
        both = sum(1 for k in shared if bool(a[k].get(field)) == bool(b[k].get(field)))
        p1 = sum(1 for k in shared if a[k].get(field)) / len(shared)
        p2 = sum(1 for k in shared if b[k].get(field)) / len(shared)
        po, pe = both / len(shared), p1 * p2 + (1 - p1) * (1 - p2)
        kappa = (po - pe) / (1 - pe) if pe < 1 else 1.0
        per = {}
        for k in shared:
            c = per.setdefault(column_kind(k[0]), [0, 0])
            c[0] += bool(a[k].get(field))
            c[1] += bool(b[k].get(field))
        split = [f"{k[0]}:{k[1]} primary={bool(a[k].get(field))}" for k in shared if bool(a[k].get(field)) != bool(b[k].get(field))]
        print(json.dumps({"field": field, "agree": f"{both}/{len(shared)}", "kappa": round(kappa, 2), "primary_vs_second": per, "splits": split}))


if __name__ == "__main__":
    command = sys.argv[1]
    if command == "build":
        for i, name in enumerate(SETS):
            build_style(name, 61 + i)
            build_style(name, 71 + i, sample(name)) if name.endswith("r1") else None
            build_fidelity(name, 81 + i)
            build_fidelity(name, 91 + i, sample(name)) if name.endswith("r1") else None
    elif command == "judge":
        folder, model = Path(sys.argv[2]), sys.argv[3]
        name = folder.name.removeprefix("fid-").removesuffix("-fable")
        if folder.name.startswith("fid-"):
            judge(folder, HERE.resolve() / "fidelity-brief.md", None, model)
        else:
            judge(folder, HERE.resolve() / "label-brief.md", SOURCE / "score" / SETS[name][2], model)
    elif command == "totals":
        totals(sys.argv[2])
    elif command == "agree":
        agree(sys.argv[2], sys.argv[3], sys.argv[4])
