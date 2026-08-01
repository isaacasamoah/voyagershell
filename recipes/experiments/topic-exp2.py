"""Measure the implementation's claim-vector candidate floor and top-k window."""
from topic_exp_common import CONTRACT, CORPUS, candidate_pairs, embed

vectors = embed([row[2] for row in CORPUS])
blocking = candidate_pairs(vectors)
print(
    f"matcherVersion={CONTRACT['version']} floor={CONTRACT['candidateFloor']:.3f} "
    f"limit={CONTRACT['candidateLimit']}"
)
print(
    f"candidatePairs={len(blocking['pairs'])}/666 "
    f"truePairs={blocking['surfacedSame']}/{blocking['totalSame']}"
)
print(
    f"blocking directionalRecall@8={blocking['directionalRecall']:.3f} "
    f"pairRecall@8={blocking['pairRecall']:.3f}"
)
if blocking["pairRecall"] < 0.95:
    raise SystemExit("blocking acceptance failed")
