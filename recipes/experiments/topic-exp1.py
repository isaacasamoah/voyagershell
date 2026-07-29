"""Real-vector falsification: embeddings rank identity but cannot decide it."""
import itertools

from topic_exp_common import CORPUS, candidate_pairs, cosine, embed


def analyse(name, vectors):
    same, different = [], []
    for left, right in itertools.combinations(range(len(CORPUS)), 2):
        score = cosine(vectors[left], vectors[right])
        (same if CORPUS[left][0] == CORPUS[right][0] else different).append(score)
    same.sort()
    different.sort()
    wins = sum(score > other for score in same for other in different)
    auc = wins / (len(same) * len(different))
    best = (0, 0, 0, 0)
    for step in range(200):
        threshold = step / 200
        true_positive = sum(score >= threshold for score in same)
        false_positive = sum(score >= threshold for score in different)
        if not true_positive:
            continue
        precision = true_positive / (true_positive + false_positive)
        recall = true_positive / len(same)
        f1 = 2 * precision * recall / (precision + recall)
        if f1 > best[0]:
            best = (f1, threshold, precision, recall)
    print(f"{name}: AUC={auc:.3f} bestF1={best[0]:.3f} threshold={best[1]:.2f}")
    print(
        f"{name}: sameMin={same[0]:.3f} differentMax={different[-1]:.3f} "
        f"overlap={same[0] < different[-1]}"
    )


labels = embed([row[1] for row in CORPUS])
claims = embed([row[2] for row in CORPUS])
print(f"corpus={len(CORPUS)} subjects={len(set(row[0] for row in CORPUS))} pairs=666")
analyse("label", labels)
analyse("claim", claims)
blocking = candidate_pairs(claims)
print(
    f"implementation blocker directionalRecall@8={blocking['directionalRecall']:.3f} "
    f"pairRecall@8={blocking['pairRecall']:.3f}"
)
