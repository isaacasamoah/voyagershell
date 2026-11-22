import json
import sys
from pathlib import Path

ORDER = ["idle", "streaming", "fleets", "builds"]


def main():
    root = Path(sys.argv[1])
    labels = sys.argv[2:]
    print("| run | load | moves | latency median | p95 | max | frames shown | dropped | draw median | input share |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for label in labels:
        cases = {case["case"]: case for case in json.loads((root / label / "summary.json").read_text())}
        for name in ORDER:
            case = cases.get(name)
            if not case:
                continue
            latency = case["latencyMs"]
            print(
                f"| {label} | {name} | {case['inputsMatched']} | {latency['median']:.1f} | {latency['p95']:.1f} | "
                f"{latency['max']:.1f} | {case['presents']}/{case['expectedFrames']} | {case['droppedFrames']} | "
                f"{case['drawMs']['median']:.2f} | {case['mainThreadBusyShare'].get('input', 0):.0%} |"
            )


if __name__ == "__main__":
    main()
