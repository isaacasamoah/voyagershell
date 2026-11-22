import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

REFRESH_NS = 1_000_000_000 / 60


def quantile(values, q):
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(q * (len(ordered) - 1))))
    return ordered[index]


def ms(value):
    return None if value is None else round(value / 1e6, 2)


def records(evidence):
    out = []
    for line in (evidence / "frames.jsonl").read_text().splitlines():
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if record.get("event") != "voyager_frame_work":
            continue
        drained = record.get("wall_before_ns")
        if drained is None:
            continue
        if "start_age_ns" in record and record["start_age_ns"] is not None:
            record["t0"] = drained - record["start_age_ns"]
        if "end_age_ns" in record and record["end_age_ns"] is not None:
            record["t1"] = drained - record["end_age_ns"]
        if record.get("category") == "submit_paired":
            record["draw_t0"] = drained - record["draw_start_age_ns"]
            record["draw_t1"] = drained - record["draw_end_age_ns"]
        out.append(record)
    return out


def summarise(evidence, window, all_records):
    moves = window["moves"]
    first, last = moves[0]["at_ns"], moves[-1]["at_ns"]
    inside = [r for r in all_records if "t0" in r and first - 50e6 <= r["t0"] <= last + 1e9]
    draws = [r for r in inside if r.get("category") == "draw"]
    windows = defaultdict(int)
    for draw in draws:
        windows[draw["window"]] += 1
    workspace = max(windows, key=windows.get) if windows else None
    draws = [d for d in draws if d["window"] == workspace]
    presents = sorted(
        (r for r in inside if r.get("category") == "submit_paired" and r["window"] == workspace),
        key=lambda r: r["t1"],
    )
    inputs = sorted(
        (r for r in inside if r.get("category") == "input" and "move" in str(r.get("kind", "")).lower()),
        key=lambda r: r["t0"],
    )
    matched = []
    cursor = 0
    for move in moves:
        while cursor < len(inputs) and inputs[cursor]["t0"] < move["at_ns"]:
            cursor += 1
        if cursor == len(inputs):
            break
        matched.append((move, inputs[cursor]))
        cursor += 1
    queue = [handled["t0"] - move["at_ns"] for move, handled in matched]
    latency = []
    unpainted = 0
    present_index = 0
    for move, handled in matched:
        while present_index < len(presents) and presents[present_index]["draw_t0"] < handled["t1"]:
            present_index += 1
        if present_index == len(presents):
            unpainted += 1
            continue
        latency.append(presents[present_index]["t1"] - move["at_ns"])
    during = [p for p in presents if first <= p["t1"] <= last]
    gaps = [b["t1"] - a["t1"] for a, b in zip(during, during[1:])]
    dropped = sum(max(0, round(gap / REFRESH_NS) - 1) for gap in gaps)
    expected = (last - first) / REFRESH_NS
    durations = [d["duration_ns"] for d in draws if first <= d["t0"] <= last]
    phases = {
        name: ms(statistics.median([d[f"{name}_ns"] for d in draws if d.get(f"{name}_ns") is not None]))
        if draws
        else None
        for name in ("layout", "prepaint", "paint")
    }
    views = defaultdict(lambda: [0, 0])
    for record in inside:
        if record.get("category") == "view" and first <= record["t0"] <= last:
            views[record["name"]][0] += record.get("self_ns") or 0
            views[record["name"]][1] += 1
    tasks = defaultdict(lambda: [0, 0])
    for record in inside:
        if record.get("category") == "task" and first <= record["t0"] <= last:
            tasks[f'{record["file"]}:{record["line"]}'][0] += record.get("duration_ns") or 0
            tasks[f'{record["file"]}:{record["line"]}'][1] += 1
    submits = [p["duration_ns"] for p in during]
    busy = defaultdict(int)
    busy["present"] = sum(submits)
    for record in inside:
        if record.get("category") in ("draw", "task", "input", "small_polls") and first <= record["t0"] <= last:
            busy[record["category"]] += record.get("duration_ns") or 0
    span = last - first
    return {
        "case": window["case"],
        "moves": len(moves),
        "inputsMatched": len(matched),
        "unpainted": unpainted,
        "load": [window["load_before"], window["load_after"]],
        "running": window["running"],
        "latencyMs": {"median": ms(quantile(latency, 0.5)), "p95": ms(quantile(latency, 0.95)), "max": ms(max(latency) if latency else None)},
        "queueMs": {"median": ms(quantile(queue, 0.5)), "p95": ms(quantile(queue, 0.95))},
        "drawMs": {"median": ms(quantile(durations, 0.5)), "p95": ms(quantile(durations, 0.95)), "max": ms(max(durations) if durations else None)},
        "phasesMedianMs": phases,
        "presentMs": {"median": ms(quantile(submits, 0.5)), "p95": ms(quantile(submits, 0.95))},
        "presents": len(during),
        "expectedFrames": round(expected),
        "droppedFrames": dropped,
        "presentGapMs": {"median": ms(quantile(gaps, 0.5)), "p95": ms(quantile(gaps, 0.95)), "max": ms(max(gaps) if gaps else None)},
        "mainThreadBusyShare": {k: round(v / span, 3) for k, v in busy.items()},
        "topViewsMs": sorted(((name, ms(v[0]), v[1]) for name, v in views.items()), key=lambda x: -(x[1] or 0))[:8],
        "topTasksMs": sorted(((name, ms(v[0]), v[1]) for name, v in tasks.items()), key=lambda x: -(x[1] or 0))[:8],
        "inputKinds": sorted({str(r.get("kind")) for r in inside if r.get("category") == "input"}),
    }


def echoes(evidence):
    out = []
    for name in ("app.log",):
        path = evidence / name
        if not path.exists():
            continue
        for line in path.read_text(errors="replace").splitlines():
            if "voyager_key_echo_parsed" not in line:
                continue
            try:
                out.append(json.loads(line)["wall_ns"])
            except (json.JSONDecodeError, KeyError):
                continue
    return sorted(out)


def summarise_typing(window, all_records, parsed):
    keys = [key["at_ns"] for key in window["keys"]]
    first, last = keys[0], keys[-1] + 500e6
    inside = [r for r in all_records if "t0" in r and first - 50e6 <= r["t0"] <= last]
    draws = [r for r in inside if r.get("category") == "draw"]
    windows = defaultdict(int)
    for draw in draws:
        windows[draw["window"]] += 1
    workspace = max(windows, key=windows.get) if windows else None
    draws = [d for d in draws if d["window"] == workspace]
    presents = sorted((r for r in inside if r.get("category") == "submit_paired" and r["window"] == workspace), key=lambda r: r["t1"])
    latency, echo_wait, missing = [], [], 0
    cursor = 0
    for key in keys:
        while cursor < len(parsed) and parsed[cursor] < key:
            cursor += 1
        if cursor == len(parsed):
            missing += 1
            continue
        echo = parsed[cursor]
        cursor += 1
        shown = next((p["t1"] for p in presents if p["draw_t0"] >= echo), None)
        if shown is None:
            missing += 1
            continue
        echo_wait.append(echo - key)
        latency.append(shown - key)
    during = [p for p in presents if first <= p["t1"] <= last]
    durations = [d["duration_ns"] for d in draws if first <= d["t0"] <= last]
    phases = {
        name: ms(statistics.median([d[f"{name}_ns"] for d in draws if d.get(f"{name}_ns") is not None])) if draws else None
        for name in ("layout", "prepaint", "paint")
    }
    span = last - first
    busy = defaultdict(int)
    for record in inside:
        if record.get("category") in ("draw", "task", "input", "small_polls") and first <= record["t0"] <= last:
            busy[record["category"]] += record.get("duration_ns") or 0
    busy["present"] = sum(p["duration_ns"] for p in during)
    return {
        "case": window["case"],
        "keys": len(keys),
        "missing": missing,
        "keyLatencyMs": {"median": ms(quantile(latency, 0.5)), "p95": ms(quantile(latency, 0.95)), "max": ms(max(latency) if latency else None)},
        "echoParsedMs": {"median": ms(quantile(echo_wait, 0.5)), "p95": ms(quantile(echo_wait, 0.95))},
        "drawMs": {"median": ms(quantile(durations, 0.5)), "p95": ms(quantile(durations, 0.95)), "max": ms(max(durations) if durations else None)},
        "phasesMedianMs": phases,
        "presentsPerSecond": round(len(during) / (span / 1e9), 1),
        "mainThreadBusyShare": {k: round(v / span, 3) for k, v in busy.items()},
    }


def main():
    results = []
    for argument in sys.argv[1:]:
        evidence = Path(argument)
        all_records = records(evidence)
        for drag in sorted(evidence.glob("drag-*.json")):
            window = json.loads(drag.read_text())
            summary = summarise(evidence, window, all_records)
            summary["evidence"] = str(evidence)
            results.append(summary)
        parsed = echoes(evidence)
        for typed in sorted(evidence.glob("typing-*.json")):
            window = json.loads(typed.read_text())
            summary = summarise_typing(window, all_records, parsed)
            summary["kind"] = "typing"
            summary["evidence"] = str(evidence)
            results.append(summary)
    print(json.dumps(results, indent=1))


if __name__ == "__main__":
    main()
