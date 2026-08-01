"""Score the exact production matcher instruction over blocked candidate pairs."""
import json

from topic_exp_common import (
    CONTRACT,
    CORPUS,
    candidate_pairs,
    embed,
    request,
    response_text,
)


def judge(pairs):
    lines = [
        f"{number}. Memory: {json.dumps(memory)}\n"
        f"   Candidate topic: {json.dumps({'label': label, 'representativeClaim': representative})}"
        for number, (memory, label, representative) in enumerate(pairs, 1)
    ]
    data = request("responses", {
        "model": "gpt-5.5",
        "instructions": CONTRACT["instruction"] + """

For this measured harness, judge each numbered memory/candidate pair by the
same filing test. Return one JSON object and no prose:
{"answers":[{"n":1,"reuse":true|false}]}""",
        "input": "Return json.\n" + "\n".join(lines),
        "text": {"format": {"type": "json_object"}},
    })
    return {
        answer["n"]: answer["reuse"]
        for answer in json.loads(response_text(data))["answers"]
    }


vectors = embed([row[2] for row in CORPUS])
blocking = candidate_pairs(vectors)
verdicts = {}
batch = 20
for start in range(0, len(blocking["pairs"]), batch):
    chunk = blocking["pairs"][start:start + batch]
    answers = judge([
        (CORPUS[left][2], CORPUS[right][1], CORPUS[right][2])
        for left, right in chunk
    ])
    for number, pair in enumerate(chunk, 1):
        verdicts[pair] = bool(answers.get(number, False))
    print(f"judged={min(start + batch, len(blocking['pairs']))}/{len(blocking['pairs'])}")

true_positive = sum(verdicts[pair] and blocking["truth"][pair] for pair in verdicts)
false_positive = sum(verdicts[pair] and not blocking["truth"][pair] for pair in verdicts)
precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0
recall = true_positive / blocking["totalSame"]
f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
print(
    f"blockingRecall@8={blocking['pairRecall']:.3f} matcherPrecision={precision:.3f} "
    f"pipelineRecall={recall:.3f} pipelineF1={f1:.3f} falseMerges={false_positive}"
)
for pair in blocking["pairs"]:
    if verdicts[pair] != blocking["truth"][pair]:
        left, right = pair
        kind = "FALSE_MERGE" if verdicts[pair] else "missed"
        print(f"{kind}: {CORPUS[left][1]!r} ~ {CORPUS[right][1]!r}")

if blocking["pairRecall"] < 0.95:
    raise SystemExit("blocking acceptance failed")
if precision != 1:
    raise SystemExit("matcher precision acceptance failed")
if f1 < 0.90:
    raise SystemExit("pipeline F1 acceptance failed")
print("TOPIC_IDENTITY_HARNESS_GREEN")
