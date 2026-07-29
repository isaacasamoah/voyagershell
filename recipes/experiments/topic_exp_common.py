import itertools
import json
import math
import os
import pathlib
import urllib.error
import urllib.request

CORPUS = [
    ("quantum", "quantum engines", "The quantum engines work shipped to staging on Tuesday."),
    ("quantum", "the qe work", "We finally got the QE work past review this week."),
    ("quantum", "quantum propulsion", "Quantum propulsion research is the focus for next quarter."),
    ("quantum", "qe project", "The QE project has two engineers on it now."),
    ("caffeine", "coffee consumption", "Isaac has decided to stop drinking coffee after 2pm."),
    ("caffeine", "caffeine habits", "Isaac is cutting out caffeine in the afternoons."),
    ("caffeine", "afternoon coffee", "No more espresso past two o'clock for Isaac."),
    ("cafes", "coffee shops", "Elisheya's favourite coffee shop is the one on Lygon Street."),
    ("cafes", "lygon street cafes", "The cafe on Lygon Street does the best pastries in Carlton."),
    ("cafes", "cafe recommendations", "Elisheya recommended a new cafe near the market."),
    ("marathon", "melbourne half marathon", "Elisheya is training for the Melbourne half marathon in October."),
    ("marathon", "half marathon prep", "Els has been doing long runs every weekend to prep for the half."),
    ("marathon", "october race", "The October race is twelve weeks away now."),
    ("trails", "trail running", "Isaac prefers trail running to road running."),
    ("trails", "trail routes", "The trails around the Dandenongs are good in winter."),
    ("physio", "physio appointment", "Elisheya's physio appointment is every second Thursday."),
    ("physio", "physiotherapy schedule", "Els sees the physiotherapist fortnightly on Thursdays."),
    ("physio", "rathdowne street clinic", "The physio clinic is on Rathdowne Street in Carlton."),
    ("brevity", "response length preference", "The user prefers answers kept to two sentences unless detail is asked for."),
    ("brevity", "answer style", "Isaac wants short replies, not essays."),
    ("brevity", "conciseness", "Keep responses brief unless I ask you to expand."),
    ("school", "school night routine", "No screen time on school nights in this house."),
    ("school", "screen time rules", "The kids lose devices after dinner on weeknights."),
    ("school", "weeknight rules", "Weeknights are homework then bed, no exceptions."),
    ("deploy", "deployment process", "Voyager releases to dev, and main is production."),
    ("deploy", "release pipeline", "Everything goes through dev before it reaches prod."),
    ("deploy", "branch flow", "Feature branches merge into dev, never straight to main."),
    ("supabase", "supabase branches", "The dev database is the voyager-dev Supabase branch."),
    ("supabase", "database refs", "Never write migrations against the primary project ref."),
    ("sleep", "sleep quality", "Isaac has been sleeping badly for the past fortnight."),
    ("sleep", "insomnia", "Getting to sleep before midnight has been hard lately."),
    ("bday", "birthday planning", "Elisheya's birthday is in March and she wants something small."),
    ("bday", "march birthday", "We should plan something low key for Els in March."),
    ("grocery", "grocery shopping", "The weekly shop happens Saturday mornings at the market."),
    ("grocery", "market run", "Saturday is when we do the fruit and veg run."),
    ("car", "car servicing", "The car is due for a service in August."),
    ("car", "vehicle maintenance", "Booked the car in for its 60,000km service."),
]

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONTRACT = json.loads(
    (ROOT / "lib/agents/cartographer/topic-matcher-contract.json").read_text()
)
KEY = os.environ["OPENAI_API_KEY"]


def request(path, payload, timeout=300):
    req = urllib.request.Request(
        "https://api.openai.com/v1/" + path,
        data=json.dumps(payload).encode(),
        headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"},
    )
    try:
        return json.load(urllib.request.urlopen(req, timeout=timeout))
    except urllib.error.HTTPError as error:
        raise RuntimeError(error.read().decode()) from error


def embed(texts):
    result = []
    for start in range(0, len(texts), 64):
        data = request("embeddings", {
            "model": "text-embedding-3-small",
            "input": texts[start:start + 64],
            "dimensions": 1536,
        }, 90)
        result.extend(item["embedding"] for item in data["data"])
    return result


def cosine(left, right):
    return sum(a * b for a, b in zip(left, right)) / (
        math.sqrt(sum(a * a for a in left)) * math.sqrt(sum(b * b for b in right))
    )


def candidate_pairs(vectors):
    limit = CONTRACT["candidateLimit"]
    floor = CONTRACT["candidateFloor"]
    pairs = set()
    directional_hits = directional_total = 0
    for index in range(len(CORPUS)):
        peers = {
            other for other in range(len(CORPUS))
            if other != index and CORPUS[other][0] == CORPUS[index][0]
        }
        ranked = sorted(
            (
                (other, cosine(vectors[index], vectors[other]))
                for other in range(len(CORPUS)) if other != index
            ),
            key=lambda item: (-item[1], item[0]),
        )
        window = [other for other, score in ranked if score >= floor][:limit]
        for other in window:
            pairs.add((min(index, other), max(index, other)))
        if peers:
            directional_hits += bool(peers.intersection(window))
            directional_total += 1
    pairs = sorted(pairs)
    truth = {pair: CORPUS[pair[0]][0] == CORPUS[pair[1]][0] for pair in pairs}
    total_same = sum(
        CORPUS[left][0] == CORPUS[right][0]
        for left, right in itertools.combinations(range(len(CORPUS)), 2)
    )
    surfaced_same = sum(truth.values())
    return {
        "pairs": pairs,
        "truth": truth,
        "totalSame": total_same,
        "surfacedSame": surfaced_same,
        "pairRecall": surfaced_same / total_same,
        "directionalRecall": directional_hits / directional_total,
    }


def response_text(data):
    return "".join(
        content.get("text", "")
        for output in data.get("output", [])
        for content in output.get("content", [])
        if content.get("type") == "output_text"
    )
