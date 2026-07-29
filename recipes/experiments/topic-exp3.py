"""Experiment 3 — does a sharper matcher prompt lift recall without costing precision?

Same corpus, same blocking, same 189 candidate pairs as experiment 2. Only the
matcher instruction changes. Baseline (A) measured: P=1.000 R=0.758 F1=0.862.

Few-shot examples are deliberately drawn from OUTSIDE the test corpus so the
variants are not scored on leaked answers.
"""
import json, os, math, urllib.request, itertools

exec(open(os.path.expanduser("~/.claude/jobs/5ee5af34/tmp/topic-exp1.py")).read().split("KEY = ")[0])
KEY = os.environ["OPENAI_API_KEY"]
K, BATCH = 8, 20

VARIANTS = {
"A_baseline": """You maintain the topic index of a personal memory system.

A topic is a SUBJECT that memories are filed under. Two memories share a topic
only when they are about the same subject — not merely when they are related.
Caffeine and sleep are related; they are different subjects. A specific event
and the general activity are different subjects.

For each numbered pair, answer whether the two memories belong under the SAME
topic. Reply with one json object: {"answers":[{"n":1,"same":true|false}]}""",

"B_retrieval": """You maintain the topic index of a personal memory system. Topics
exist so that when someone asks about a subject, everything about that subject
comes back together.

For each numbered pair, apply this test: if the person went looking for one of
these memories, would they expect the other one filed alongside it, under the
same heading? If yes, they share a topic.

Two cautions, equally weighted:
- Merely RELATED is not the same subject. Caffeine and sleep influence each
  other but someone filing "caffeine" does not expect sleep notes there.
- Different WORDING is not a different subject. Abbreviations, nicknames and
  paraphrases of the same thing belong together.

Reply with one json object: {"answers":[{"n":1,"same":true|false}]}""",

"C_fewshot": """You maintain the topic index of a personal memory system. Decide
whether two memories belong under the same topic heading.

Worked examples (not from the data you will judge):
- "The rates review lands in April" / "RR is due next month" -> SAME. An
  abbreviation of the same initiative.
- "Mum's knee surgery is booked for June" / "Mum has been in a lot of pain" ->
  SAME. Both are the same ongoing health situation.
- "I take the 7:15 train" / "The train line is being upgraded" -> DIFFERENT. One
  is a personal routine, the other is infrastructure news.
- "We're going to Japan in spring" / "I've been learning Japanese" -> DIFFERENT.
  Related by association, different subjects.
- "Sam plays Saturday football" / "Sam's team won the grand final" -> SAME. Both
  concern Sam's football.

Judge by subject, not by vocabulary overlap and not by mere relatedness.
Reply with one json object: {"answers":[{"n":1,"same":true|false}]}""",

"D_name_topic": """You maintain the topic index of a personal memory system.

For each numbered pair: silently name the single topic heading each memory would
be filed under, using the most natural heading a person would choose. Then decide
whether those two headings are the same heading expressed differently.

Headings differing only in wording, abbreviation or specificity-of-phrasing are
the SAME heading. Headings naming genuinely different subjects are DIFFERENT,
even when the subjects influence each other.

Reply with one json object, no prose:
{"answers":[{"n":1,"same":true|false}]}""",
}


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


def judge(prompt, pairs):
    lines = [f'{n}. A: "{a}"\n   B: "{b}"' for n, (a, b) in enumerate(pairs, 1)]
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps({"model": "gpt-5.5", "instructions": prompt,
                         "input": "Return json.\n" + "\n".join(lines),
                         "text": {"format": {"type": "json_object"}}}).encode(),
        headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    d = json.load(urllib.request.urlopen(req, timeout=300))
    txt = "".join(c.get("text", "") for o in d.get("output", [])
                  for c in o.get("content", []) if c.get("type") == "output_text")
    return {a["n"]: a["same"] for a in json.loads(txt)["answers"]}


claims = [c[2] for c in CORPUS]
cv = embed(claims)
cands = set()
for i in range(len(CORPUS)):
    for j in sorted((j for j in range(len(CORPUS)) if j != i), key=lambda j: -cos(cv[i], cv[j]))[:K]:
        cands.add((min(i, j), max(i, j)))
cands = sorted(cands)
truth = {p: CORPUS[p[0]][0] == CORPUS[p[1]][0] for p in cands}
total_same = sum(1 for i, j in itertools.combinations(range(len(CORPUS)), 2)
                 if CORPUS[i][0] == CORPUS[j][0])

results = {}
for name, prompt in VARIANTS.items():
    v = {}
    for s in range(0, len(cands), BATCH):
        chunk = cands[s:s+BATCH]
        try:
            res = judge(prompt, [(CORPUS[i][2], CORPUS[j][2]) for i, j in chunk])
        except Exception as e:
            print(f"    {name}: batch {s} failed {e}"); res = {}
        for n, p in enumerate(chunk, 1):
            v[p] = bool(res.get(n, False))
    tp = sum(1 for p in cands if v[p] and truth[p])
    fp = sum(1 for p in cands if v[p] and not truth[p])
    prec = tp/(tp+fp) if tp+fp else 0
    rec = tp/total_same
    f1 = 2*prec*rec/(prec+rec) if prec+rec else 0
    results[name] = (prec, rec, f1, tp, fp, v)
    print(f"  {name:14s} P={prec:.3f} R={rec:.3f} F1={f1:.3f}  (merged {tp} true, {fp} false)")

print("\n  === comparison (threshold-only best possible F1 = 0.706) ===")
for n, (p, r, f, tp, fp, _) in sorted(results.items(), key=lambda x: -x[1][2]):
    print(f"    {n:14s} F1={f:.3f}  P={p:.3f}  R={r:.3f}  false-merges={fp}")

best = max(results.items(), key=lambda x: x[1][2])
print(f"\n  === {best[0]} — remaining disagreements ===")
for p in cands:
    if best[1][5][p] != truth[p]:
        i, j = p
        print(f"    {'FALSE MERGE' if best[1][5][p] else 'missed     '} "
              f"{cos(cv[i],cv[j]):.3f}  {CORPUS[i][1]!r} ~ {CORPUS[j][1]!r}")
