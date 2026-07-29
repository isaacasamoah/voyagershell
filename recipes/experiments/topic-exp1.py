"""Experiment 1 — does claim-level blocking separate where label-level failed?

Ground truth: each claim is tagged with its true subject id. Two claims share a
subject or they do not. We measure whether embedding similarity can separate
those two populations — at the LABEL level (what K4b built) and at the CLAIM
level (the proposal).

Deliberately includes the shapes that broke K4b: abbreviations, paraphrase,
topically-adjacent-but-distinct, and shared-vocabulary-but-different-subject.
"""
import json, os, math, urllib.request, itertools

# (subject_id, topic_label_the_model_would_propose, claim_sentence)
CORPUS = [
    # --- one subject, incl. an abbreviation and a paraphrase (K4b's failure) ---
    ("quantum", "quantum engines", "The quantum engines work shipped to staging on Tuesday."),
    ("quantum", "the qe work", "We finally got the QE work past review this week."),
    ("quantum", "quantum propulsion", "Quantum propulsion research is the focus for next quarter."),
    ("quantum", "qe project", "The QE project has two engineers on it now."),
    # --- caffeine: the real pair that split (0.646) ---
    ("caffeine", "coffee consumption", "Isaac has decided to stop drinking coffee after 2pm."),
    ("caffeine", "caffeine habits", "Isaac is cutting out caffeine in the afternoons."),
    ("caffeine", "afternoon coffee", "No more espresso past two o'clock for Isaac."),
    # --- coffee shops: shares vocabulary with caffeine, DIFFERENT subject ---
    ("cafes", "coffee shops", "Elisheya's favourite coffee shop is the one on Lygon Street."),
    ("cafes", "lygon street cafes", "The cafe on Lygon Street does the best pastries in Carlton."),
    ("cafes", "cafe recommendations", "Elisheya recommended a new cafe near the market."),
    # --- marathon: adjacent to running but distinct ---
    ("marathon", "melbourne half marathon", "Elisheya is training for the Melbourne half marathon in October."),
    ("marathon", "half marathon prep", "Els has been doing long runs every weekend to prep for the half."),
    ("marathon", "october race", "The October race is twelve weeks away now."),
    # --- trail running: adjacent to marathon, DIFFERENT subject ---
    ("trails", "trail running", "Isaac prefers trail running to road running."),
    ("trails", "trail routes", "The trails around the Dandenongs are good in winter."),
    # --- physio ---
    ("physio", "physio appointment", "Elisheya's physio appointment is every second Thursday."),
    ("physio", "physiotherapy schedule", "Els sees the physiotherapist fortnightly on Thursdays."),
    ("physio", "rathdowne street clinic", "The physio clinic is on Rathdowne Street in Carlton."),
    # --- answer style preference ---
    ("brevity", "response length preference", "The user prefers answers kept to two sentences unless detail is asked for."),
    ("brevity", "answer style", "Isaac wants short replies, not essays."),
    ("brevity", "conciseness", "Keep responses brief unless I ask you to expand."),
    # --- school routine ---
    ("school", "school night routine", "No screen time on school nights in this house."),
    ("school", "screen time rules", "The kids lose devices after dinner on weeknights."),
    ("school", "weeknight rules", "Weeknights are homework then bed, no exceptions."),
    # --- deploys ---
    ("deploy", "deployment process", "Voyager releases to dev, and main is production."),
    ("deploy", "release pipeline", "Everything goes through dev before it reaches prod."),
    ("deploy", "branch flow", "Feature branches merge into dev, never straight to main."),
    # --- supabase infra: adjacent to deploy, distinct ---
    ("supabase", "supabase branches", "The dev database is the voyager-dev Supabase branch."),
    ("supabase", "database refs", "Never write migrations against the primary project ref."),
    # --- sleep ---
    ("sleep", "sleep quality", "Isaac has been sleeping badly for the past fortnight."),
    ("sleep", "insomnia", "Getting to sleep before midnight has been hard lately."),
    # --- birthdays ---
    ("bday", "birthday planning", "Elisheya's birthday is in March and she wants something small."),
    ("bday", "march birthday", "We should plan something low key for Els in March."),
    # --- groceries ---
    ("grocery", "grocery shopping", "The weekly shop happens Saturday mornings at the market."),
    ("grocery", "market run", "Saturday is when we do the fruit and veg run."),
    # --- car ---
    ("car", "car servicing", "The car is due for a service in August."),
    ("car", "vehicle maintenance", "Booked the car in for its 60,000km service."),
]

KEY = os.environ["OPENAI_API_KEY"]


def embed(texts):
    out = []
    for i in range(0, len(texts), 64):
        chunk = texts[i:i + 64]
        req = urllib.request.Request(
            "https://api.openai.com/v1/embeddings",
            data=json.dumps({"model": "text-embedding-3-small", "input": chunk,
                             "dimensions": 1536}).encode(),
            headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
        out += [d["embedding"] for d in json.load(urllib.request.urlopen(req, timeout=90))["data"]]
    return out


def cos(a, b):
    return sum(x * y for x, y in zip(a, b)) / (
        math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))


def analyse(name, vecs):
    same, diff = [], []
    for i, j in itertools.combinations(range(len(CORPUS)), 2):
        s = cos(vecs[i], vecs[j])
        (same if CORPUS[i][0] == CORPUS[j][0] else diff).append((s, i, j))
    same_s = sorted(x[0] for x in same)
    diff_s = sorted(x[0] for x in diff)

    # AUC = P(random same-pair scores above random diff-pair)
    wins = sum(1 for s in same_s for d in diff_s if s > d)
    auc = wins / (len(same_s) * len(diff_s))

    # best achievable F1 over all thresholds
    best = (0, 0, 0, 0)
    for t in [x / 200 for x in range(0, 200)]:
        tp = sum(1 for s in same_s if s >= t)
        fp = sum(1 for s in diff_s if s >= t)
        fn = len(same_s) - tp
        if tp == 0:
            continue
        p, r = tp / (tp + fp), tp / (tp + fn)
        f1 = 2 * p * r / (p + r)
        if f1 > best[0]:
            best = (f1, t, p, r)

    print(f"\n  === {name} ===")
    print(f"    same-subject pairs: {len(same_s)}   different-subject pairs: {len(diff_s)}")
    print(f"    same    min={same_s[0]:.3f}  median={same_s[len(same_s)//2]:.3f}  max={same_s[-1]:.3f}")
    print(f"    diff    min={diff_s[0]:.3f}  median={diff_s[len(diff_s)//2]:.3f}  max={diff_s[-1]:.3f}")
    print(f"    OVERLAP: same-min {same_s[0]:.3f} vs diff-max {diff_s[-1]:.3f} -> "
          f"{'BANDS OVERLAP (no clean threshold)' if same_s[0] < diff_s[-1] else 'SEPARABLE'}")
    print(f"    AUC = {auc:.3f}   best-F1 = {best[0]:.3f} at threshold {best[1]:.2f} "
          f"(precision {best[2]:.3f}, recall {best[3]:.3f})")

    # what a 0.7 threshold (what K4b shipped) would do
    tp = sum(1 for s in same_s if s >= 0.7)
    fp = sum(1 for s in diff_s if s >= 0.7)
    print(f"    at K4b's 0.70: would merge {tp}/{len(same_s)} true pairs, "
          f"and wrongly merge {fp} false pairs")
    return same, diff, auc


def recall_at_k(vecs, k=8):
    """The actual blocking metric: is a true same-subject item in the top-k?"""
    hits = tot = 0
    for i in range(len(CORPUS)):
        peers = [j for j in range(len(CORPUS)) if j != i and CORPUS[j][0] == CORPUS[i][0]]
        if not peers:
            continue
        ranked = sorted((j for j in range(len(CORPUS)) if j != i),
                        key=lambda j: -cos(vecs[i], vecs[j]))[:k]
        hits += any(j in ranked for j in peers)
        tot += 1
    return hits / tot


labels = [c[1] for c in CORPUS]
claims = [c[2] for c in CORPUS]
print(f"  corpus: {len(CORPUS)} claims across {len(set(c[0] for c in CORPUS))} subjects")

lv = embed(labels)
cv = embed(claims)
analyse("LABEL-level (what K4b built)", lv)
analyse("CLAIM-level (the proposal)", cv)

print(f"\n  === BLOCKING recall@8 (does the shortlist contain a true match?) ===")
print(f"    label-level: {recall_at_k(lv):.3f}")
print(f"    claim-level: {recall_at_k(cv):.3f}")

# hard cases for experiment 2
print(f"\n  === hardest pairs for a matcher to adjudicate ===")
same, diff, _ = analyse("CLAIM-level again (for pair extraction)", cv)
for s, i, j in sorted(same)[:4]:
    print(f"    SAME  {s:.3f}  {CORPUS[i][1]!r} ~ {CORPUS[j][1]!r}")
for s, i, j in sorted(diff, reverse=True)[:4]:
    print(f"    DIFF  {s:.3f}  {CORPUS[i][1]!r} ~ {CORPUS[j][1]!r}")
