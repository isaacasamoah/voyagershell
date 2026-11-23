import json, os, random, re, statistics, subprocess, sys

S = "/var/tmp/voyager-crew/scratch/model-tiers/exp0"
R = "/var/tmp/voyager-crew/scratch/voice-spoken-r2"


def bdir(batch):
    mine = f"{S}/batch-{batch}"
    return mine if os.path.isdir(mine) else f"{R}/batch-{batch}"
CLAUDE = "/home/isaac/.local/share/fnm/node-versions/v24.13.1/installation/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe"
FIELDS = ["offer", "narration", "mechanics", "wrong", "unasked_action"]
MECH = re.compile(r"\b(t\d+[a-z]*|fleet-\d+|vessel-\d+|placement-\d+|voyage-\d+|content-\d+|revision|version \d+|placement|pane|viewer|backend|layout|request|the app calls|exit code|/[a-z]+/[a-z])", re.I)


def clean(text):
    return re.sub(r"^\s*(\[vy\]|oru:)\s*", "", text or "").strip()


def reply(batch, n):
    path = f"{bdir(batch)}/out/turn-{n:02d}.json"
    if n < 1 or not os.path.exists(path):
        return ""
    try:
        return clean(json.load(open(path)).get("result"))
    except Exception:
        return ""


def prompts(batch):
    return [line.rstrip("\n").split("\t", 1)[1] for line in open(f"{bdir(batch)}/prompts.tsv") if line.strip()]


def build(folder, batches, seed, only=None):
    os.makedirs(folder, exist_ok=True)
    rng = random.Random(seed)
    sheet, key = [], []
    for n, prompt in enumerate(prompts(batches[0]), 1):
        if only and n not in only:
            continue
        order = list(batches)
        rng.shuffle(order)
        labels = "WXYZ"[: len(order)]
        sheet.append({"turn": n, "prompt": prompt, "replies": {l: {"previous_reply_in_its_conversation": reply(b, n - 1), "reply": reply(b, n)} for l, b in zip(labels, order)}})
        key.append({"turn": n, **dict(zip(labels, order))})
    json.dump(sheet, open(f"{folder}/sheet.json", "w"), indent=1)
    json.dump(key, open(f"{folder}/key.json", "w"), indent=1)


def judge(folder, truth, model):
    task = (f"You are an independent labeller. Follow {S}/score/brief.md for the folder {folder}, with the ground-truth file {truth}. "
            f"Read only {S}/score/brief.md, {truth} and {folder}/sheet.json, and reply with only the JSON array the brief describes.")
    env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "HC_SOCKET", "HC_SESSION", "HC_TERMINAL_ID", "HC_SCOPE", "HC_TERMINAL_SOCKET")}
    run = subprocess.run([CLAUDE, "-p", "--model", model, "--permission-mode", "dontAsk", "--allowedTools", "Read", "--output-format", "json", task],
                         cwd=folder, env=env, capture_output=True, text=True, timeout=3600)
    open(f"{folder}/judge-{model}.json", "w").write(run.stdout)
    d = json.loads(run.stdout)
    text = d.get("result") or ""
    labels = json.loads(text[text.find("["): text.rfind("]") + 1])
    json.dump(labels, open(f"{folder}/labels-{model}.json", "w"), indent=1)
    sid = d.get("session_id", "")
    project = "/Users/isaac/.claude/projects/" + re.sub(r"[/.]", "-", folder)
    if sid and os.path.exists(f"{project}/{sid}.jsonl"):
        os.remove(f"{project}/{sid}.jsonl")
        for leftover in ("memory", ""):
            try:
                os.rmdir(os.path.join(project, leftover) if leftover else project)
            except OSError:
                pass
    return labels


def unblind(folder, model):
    key = {r["turn"]: r for r in json.load(open(f"{folder}/key.json"))}
    out = {}
    for row in json.load(open(f"{folder}/labels-{model}.json")):
        for label, batch in key[row["turn"]].items():
            if label != "turn" and label in row:
                out[(batch, row["turn"])] = row[label]
    return out


def summary(batches, labelled):
    lines = []
    for b in batches:
        n = len(prompts(b))
        words = [len(reply(b, i).split()) for i in range(1, n + 1)]
        regex = [i for i in range(1, n + 1) if MECH.search(reply(b, i))]
        row = {f: sorted(t for (bb, t), x in labelled.items() if bb == b and x.get(f)) for f in FIELDS}
        lines.append({"batch": b, "turns": n, "median_words": statistics.median(words), "mean_words": round(statistics.mean(words), 1),
                      **{f: len(v) for f, v in row.items()}, "turns_by_field": row, "regex_mechanics": len(regex)})
    return lines


if __name__ == "__main__":
    command = sys.argv[1]
    if command == "build":
        folder, seed, batches = sys.argv[2], int(sys.argv[3]), sys.argv[4].split(",")
        only = set(int(x) for x in sys.argv[5].split(",")) if len(sys.argv) > 5 else None
        build(folder, batches, seed, only)
    elif command == "judge":
        judge(sys.argv[2], sys.argv[3], sys.argv[4])
    elif command == "summary":
        folder, model, batches = sys.argv[2], sys.argv[3], sys.argv[4].split(",")
        for line in summary(batches, unblind(folder, model)):
            print(json.dumps(line))
