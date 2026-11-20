import json, os, random, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "acting"))
sys.path.insert(0, os.path.join(HERE, "..", "round4"))
import stand_in
from session import Session
from requests4 import R

CONFIGS = {
    "haiku-low": ("claude-haiku-5-5", "low"),
    "sonnet-low": ("claude-sonnet-5-5", "low"),
    "sonnet-medium": ("claude-sonnet-5-5", "medium"),
    "opus-low": ("claude-opus-5-5", "low"),
}
OUT = "/var/tmp/voyager-crew/scratch/voice/round5-acting"
CHUNK = 12


def main():
    name = sys.argv[1]
    runs = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    only = int(sys.argv[3]) if len(sys.argv) > 3 else len(R)
    model, effort = CONFIGS[name]
    os.makedirs(OUT, exist_ok=True)
    path = f"{OUT}/{name}.json"
    rows = []
    order = list(range(len(R)))
    for run in range(runs):
        random.Random(100 + run).shuffle(order)
        picked = order[:only]
        for start in range(0, len(picked), CHUNK):
            session = Session(model, effort)
            warm = session.turn("Which Voyage is selected?", stand_in.FOCUS)
            rows.append({"config": name, "run": run, "warmup": True, **{k: warm[k] for k in ("seconds", "error", "usage")}})
            for i in picked[start:start + CHUNK]:
                row = session.turn(R[i][1], stand_in.FOCUS)
                rows.append({"config": name, "run": run, "index": i, "category": R[i][0], "kind": R[i][2], **row})
                json.dump(rows, open(path, "w"), indent=1)
                print(name, run, i, round(row["seconds"], 1), row["first_effect_seconds"] and round(row["first_effect_seconds"], 1), repr(row["answer"][:70]), flush=True)
            session.close()
    json.dump(rows, open(path, "w"), indent=1)


main()
