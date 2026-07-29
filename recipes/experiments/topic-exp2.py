"""Experiment 2 — can a model adjudicate topic identity where the threshold cannot?

Simulates the proposed pipeline honestly: BLOCK by claim embedding (top-k), then
ask the model to decide identity for each surfaced candidate. Scores the whole
pipeline, not the model in isolation — a matcher only ever sees what blocking
surfaced, so recall is capped by the blocker.
"""
import json, os, math, urllib.request, itertools

exec(open(os.path.expanduser("~/.claude/jobs/5ee5af34/tmp/topic-exp1.py")).read().split("KEY = ")[0])
KEY = os.environ["OPENAI_API_KEY"]
K = 8


def embed(texts):
    out = []
    for i in range(0, len(texts), 64):
        req = urllib.request.Request(
            "https://api.openai.com/v1/embeddings",
            data=json.dumps({"model": "text-embedding-3-small", "input": texts[i:i+64],
                             "dimensions": 1536}).encode(),
            headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
        out += [d["embedding"] for d in json.load(urllib.request.urlopen(req, timeout=90))["data"]]
    return out


def cos(a, b):
    return sum(x*y for x, y in zip(a, b)) / (
        math.sqrt(sum(x*x for x in a)) * math.sqrt(sum(y*y for y in b)))


PROMPT = """You maintain the topic index of a personal memory system.

A topic is a SUBJECT that memories are filed under. Two memories share a topic
only when they are about the same subject — not merely when they are related.
Caffeine and sleep are related; they are different subjects. A specific event
and the general activity are different subjects.

For each numbered pair, answer whether the two memories belong under the SAME
topic. Reply with one JSON object: {"answers":[{"n":1,"same":true|false}, ...]}
No prose."""


def judge(pairs):
    lines = []
    for n, (a, b) in enumerate(pairs, 1):
        lines.append(f'{n}. A: "{a}"\n   B: "{b}"')
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps({
            "model": "gpt-5.5",
            "instructions": PROMPT,
            "input": "Return json.\n" + "\n".join(lines),
            "text": {"format": {"type": "json_object"}},
        }).encode(),
        headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    d = json.load(urllib.request.urlopen(req, timeout=300))
    txt = "".join(c.get("text", "") for o in d.get("output", [])
                  for c in o.get("content", []) if c.get("type") == "output_text")
    return {a["n"]: a["same"] for a in json.loads(txt)["answers"]}


claims = [c[2] for c in CORPUS]
cv = embed(claims)

# Build the candidate set exactly as blocking would: top-K per claim.
cands = set()
for i in range(len(CORPUS)):
    for j in sorted((j for j in range(len(CORPUS)) if j != i),
                    key=lambda j: -cos(cv[i], cv[j]))[:K]:
        cands.add((min(i, j), max(i, j)))
cands = sorted(cands)
truth = {(i, j): CORPUS[i][0] == CORPUS[j][0] for i, j in cands}

total_same = sum(1 for i, j in itertools.combinations(range(len(CORPUS)), 2)
                 if CORPUS[i][0] == CORPUS[j][0])
surfaced_same = sum(truth.values())
print(f"  blocking@{K}: {len(cands)} candidate pairs surfaced "
      f"(from {len(CORPUS)*(len(CORPUS)-1)//2} possible)")
print(f"  blocker recall: {surfaced_same}/{total_same} true pairs surfaced "
      f"= {surfaced_same/total_same:.3f}  <- caps pipeline recall")

verdicts = {}
BATCH = 12
for s in range(0, len(cands), BATCH):
    chunk = cands[s:s+BATCH]
    res = judge([(CORPUS[i][2], CORPUS[j][2]) for i, j in chunk])
    for n, (i, j) in enumerate(chunk, 1):
        verdicts[(i, j)] = bool(res.get(n, False))
    print(f"    judged {min(s+BATCH, len(cands))}/{len(cands)}")

tp = sum(1 for p in cands if verdicts[p] and truth[p])
fp = sum(1 for p in cands if verdicts[p] and not truth[p])
fn_surfaced = sum(1 for p in cands if not verdicts[p] and truth[p])
missed_by_blocker = total_same - surfaced_same

prec = tp / (tp + fp) if tp + fp else 0
rec = tp / total_same
f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0

print(f"\n  === PIPELINE: claim-blocking@{K} + model matcher ===")
print(f"    true merges:      {tp}")
print(f"    false merges:     {fp}")
print(f"    missed (matcher): {fn_surfaced}")
print(f"    missed (blocker): {missed_by_blocker}")
print(f"    precision={prec:.3f}  recall={rec:.3f}  F1={f1:.3f}")
print(f"    (best threshold-only F1 from experiment 1: 0.706)")

print(f"\n  === where the matcher disagreed with ground truth ===")
for p in cands:
    if verdicts[p] != truth[p]:
        i, j = p
        kind = "FALSE MERGE" if verdicts[p] else "missed      "
        print(f"    {kind} {cos(cv[i],cv[j]):.3f}  {CORPUS[i][1]!r} ~ {CORPUS[j][1]!r}")
