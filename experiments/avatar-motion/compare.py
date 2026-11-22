import json
import sys
from pathlib import Path

ORDER = ["idle", "streaming", "streaming20", "fleets", "builds"]


def main():
    root = Path(sys.argv[1])
    labels = sys.argv[2:]
    print("| run | load | moves | latency median | p95 | max | frames shown | dropped | draw median | input share |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for label in labels:
        summary = json.loads((root / label / "summary.json").read_text())
        cases = {case["case"]: case for case in summary if case.get("kind") != "typing"}
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





def typing():
    root = Path(sys.argv[1])
    print()
    print("| run | load | keys | key-to-screen median | p95 | key handled median / p95 | echo back median | echo drawn median / p95 | frame median | frame p95 | prepaint | paint | frames/s |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for label in sys.argv[2:]:
        summary = json.loads((root / label / "summary.json").read_text())
        cases = {case["case"]: case for case in summary if case.get("kind") == "typing"}
        for name in ORDER:
            case = cases.get(name)
            if not case or case["keyLatencyMs"]["median"] is None:
                continue
            k = case["keyLatencyMs"]
            print(
                f"| {label} | {name} | {case['keys'] - case['missing']}/{case['keys']} | {k['median']:.1f} | {k['p95']:.1f} | "
                f"{case['keyHandledMs']['median']} / {case['keyHandledMs']['p95']} | {case['echoParsedMs']['median']:.1f} | "
                f"{case['echoDrawnMs']['median']} / {case['echoDrawnMs']['p95']} | {case['drawMs']['median']:.2f} | {case['drawMs']['p95']:.2f} | "
                f"{case['phasesMedianMs']['prepaint']} | {case['phasesMedianMs']['paint']} | {case['presentsPerSecond']} |"
            )


if __name__ == "__main__":
    main()
    typing()
